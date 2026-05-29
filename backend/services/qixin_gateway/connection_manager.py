"""企信 SSE 连接池(2026-05-29)。

按 user_id 维护 N 条独立 SSE 长连接(每条对应一个用户企信 Bot):
- bootstrap_all():backend startup 时扫表 + 串行预热(200ms 间隔防同时打 Gateway)
- start_for_user / stop_for_user / restart_for_user:凭证 PUT/DELETE 钩子
- stop_all():backend shutdown 清理

收消息 → 写 qixin_messages 表(direction='in')。
"""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Dict, Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import async_session_maker, engine as db_engine
from models.qixin_message import QixinMessage
from models.user import User
from services.feishu_crypto import decrypt_secret
from services.qixin_gateway.sse_client import QixinSSEClient

logger = structlog.get_logger()

DEFAULT_GATEWAY = "https://open.fxiaoke.com"


class _Conn:
    __slots__ = ("client", "task")

    def __init__(self, client: QixinSSEClient, task: asyncio.Task):
        self.client = client
        self.task = task


_pool: Dict[str, _Conn] = {}
_lock = asyncio.Lock()


async def bootstrap_all() -> None:
    """backend startup 时调:扫表已配置用户 + 串行预热(200ms 间隔防并发打 Gateway)。"""
    async with async_session_maker() as session:
        result = await session.execute(
            select(User).where(
                User.qixin_app_id.isnot(None),
                User.qixin_app_secret.isnot(None),
            )
        )
        users = list(result.scalars().all())

    logger.info("qixin_bootstrap_users", count=len(users))
    for u in users:
        try:
            await start_for_user(u.id)
        except Exception as e:
            logger.error("qixin_bootstrap_user_failed", user_id=u.id, error=str(e))
        await asyncio.sleep(0.2)


async def start_for_user(user_id: str) -> None:
    """启动单用户 SSE 连接(若已在跑就跳过)。凭证从 DB 读 + 解密。"""
    async with _lock:
        if user_id in _pool:
            logger.info("qixin_already_running", user_id=user_id)
            return

        async with async_session_maker() as session:
            u = await session.get(User, user_id)
            if not u or not u.qixin_app_id or not u.qixin_app_secret:
                logger.warning("qixin_start_skipped_no_creds", user_id=user_id)
                return
            try:
                app_secret = decrypt_secret(u.qixin_app_secret)
            except Exception as e:
                logger.error("qixin_decrypt_failed", user_id=user_id, error=str(e))
                return
            if not app_secret:
                logger.error("qixin_empty_secret", user_id=user_id)
                return
            app_id = u.qixin_app_id
            gateway = u.qixin_gateway_url or DEFAULT_GATEWAY

        async def _on_msg(event: dict) -> None:
            await _persist_message(user_id, event)

        async def _on_conn(data: dict) -> None:
            logger.info(
                "qixin_user_connected",
                user_id=user_id,
                bot_full_id=data.get("bot_full_id"),
            )

        async def _on_err(e: Exception) -> None:
            logger.warning("qixin_user_sse_error", user_id=user_id, error=str(e))

        client = QixinSSEClient(
            user_id=user_id,
            app_id=app_id,
            app_secret=app_secret,
            gateway_base_url=gateway,
            on_message=_on_msg,
            on_connected=_on_conn,
            on_error=_on_err,
        )
        task = asyncio.create_task(client.run(), name=f"qixin-sse-{user_id}")
        _pool[user_id] = _Conn(client, task)
        logger.info("qixin_user_started", user_id=user_id, app_id=app_id, gateway=gateway)


async def stop_for_user(user_id: str) -> None:
    """优雅停掉单用户连接。"""
    async with _lock:
        conn = _pool.pop(user_id, None)
    if conn is None:
        return
    conn.client.stop()
    conn.task.cancel()
    try:
        await conn.task
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.warning("qixin_stop_task_error", user_id=user_id, error=str(e))
    logger.info("qixin_user_stopped", user_id=user_id)


async def restart_for_user(user_id: str) -> None:
    """凭证更新触发:先 stop 再 start(读最新 DB 值)。"""
    await stop_for_user(user_id)
    await start_for_user(user_id)


async def stop_all() -> None:
    """backend shutdown 时清理全部。"""
    user_ids = list(_pool.keys())
    for uid in user_ids:
        await stop_for_user(uid)
    logger.info("qixin_all_stopped", count=len(user_ids))


def list_connected() -> list[str]:
    """返当前活跃连接的 user_id 列表(运维 / 调试用)。"""
    return list(_pool.keys())


# ── 消息持久化 ──────────────────────────────────────────────────────────────

async def _persist_message(user_id: str, event: dict) -> None:
    """SSE message 事件 → qixin_messages 一行。失败只记日志,不影响 SSE 流。"""
    data = event.get("data") or {}
    chat_id = data.get("chat_id")
    if not chat_id:
        logger.warning("qixin_msg_no_chat_id", user_id=user_id, raw=str(event)[:200])
        return

    # text 优先 data.text;兼容 data.message.content
    text = data.get("text")
    if not text:
        inner = data.get("message") or {}
        text = inner.get("content") or ""

    sender = data.get("from") or {}
    ts = _parse_ts(data.get("timestamp") or data.get("date"))

    try:
        async with async_session_maker() as session:
            msg = QixinMessage(
                user_id=user_id,
                chat_id=str(chat_id),
                sender_user_id=str(sender.get("id")) if sender.get("id") else None,
                sender_name=sender.get("name"),
                direction="in",
                content=text,
                raw=data,
                ts=ts,
            )
            session.add(msg)
            await session.commit()
        logger.info(
            "qixin_msg_saved",
            user_id=user_id,
            chat_id=chat_id,
            chat_type=data.get("chat_type"),
            text_len=len(text),
        )
    except Exception as e:
        logger.error("qixin_msg_persist_failed", user_id=user_id, error=str(e))


def _parse_ts(raw) -> Optional[datetime]:
    """Gateway 时间戳 → datetime(naive UTC)。秒/毫秒自适应。"""
    if not isinstance(raw, (int, float)):
        return None
    # > 10^12 视为毫秒
    epoch_s = raw / 1000.0 if raw > 10**12 else float(raw)
    try:
        return datetime.utcfromtimestamp(epoch_s)
    except (OSError, ValueError, OverflowError):
        return None
