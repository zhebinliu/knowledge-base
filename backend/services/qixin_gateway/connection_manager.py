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


async def send_message_for_user(
    user_id: str,
    chat_id: str,
    text: str,
    reply_message_id: str | int | None = None,
) -> dict:
    """让某用户的 Bot 发消息到指定会话。

    send 走独立 REST,不依赖 SSE 在线。优先用 _pool 里 client(共享 token 缓存),
    否则从 DB 现读凭证 + 临时 client 发,同时异步把 SSE 连接预热起来。
    失败 raise RuntimeError;成功返 {"message_id": ...}。发完写一条 direction='out'。
    """
    conn = _pool.get(user_id)
    if conn is not None:
        result = await conn.client.send_message(chat_id, text, reply_message_id)
    else:
        # _pool 没有 → 从 DB 现读凭证用临时 client 直接发,同时异步起 SSE
        async with async_session_maker() as session:
            u = await session.get(User, user_id)
            if not u or not u.qixin_app_id or not u.qixin_app_secret:
                raise RuntimeError("用户未配置企信凭证")
            try:
                app_secret = decrypt_secret(u.qixin_app_secret)
            except Exception as e:
                raise RuntimeError(f"凭证解密失败: {e}")
            if not app_secret:
                raise RuntimeError("凭证解密为空,请重新配置")
            app_id = u.qixin_app_id
            gateway = u.qixin_gateway_url or DEFAULT_GATEWAY

        async def _noop_msg(_: dict) -> None: ...

        temp_client = QixinSSEClient(
            user_id=user_id,
            app_id=app_id,
            app_secret=app_secret,
            gateway_base_url=gateway,
            on_message=_noop_msg,
        )
        logger.info("qixin_send_via_temp_client", user_id=user_id, reason="pool_empty")
        result = await temp_client.send_message(chat_id, text, reply_message_id)
        # 后台预热 SSE 连接(不阻塞 send 响应)
        asyncio.create_task(start_for_user(user_id), name=f"qixin-sse-warmup-{user_id}")
    # 落库一条 out
    try:
        async with async_session_maker() as session:
            # 推断 chat_type:从同 chat 历史的最近一条继承
            inferred_type = None
            from sqlalchemy import select as _sel, desc as _desc
            recent = await session.execute(
                _sel(QixinMessage.chat_type)
                .where(QixinMessage.user_id == user_id, QixinMessage.chat_id == chat_id)
                .order_by(_desc(QixinMessage.created_at))
                .limit(1)
            )
            r = recent.scalar_one_or_none()
            if r:
                inferred_type = r
            msg = QixinMessage(
                user_id=user_id,
                chat_id=chat_id,
                chat_type=inferred_type,
                sender_user_id=None,
                sender_name="Bot",
                direction="out",
                content=text,
                raw={"sent_message_id": result.get("message_id"), "reply_message_id": reply_message_id},
                ts=datetime.utcnow(),
            )
            session.add(msg)
            await session.commit()
    except Exception as e:
        logger.error("qixin_out_msg_persist_failed", user_id=user_id, error=str(e))
    return result


# ── 消息持久化 ──────────────────────────────────────────────────────────────

async def _persist_message(user_id: str, event: dict) -> None:
    """SSE message 事件 → qixin_messages 落库 + 触发自动 RAG 回复。

    主消息 + history_messages(群聊 @Bot 时 Gateway 透传的最近 10 条上下文)都落库。
    用 gateway_message_id 去重,同一条 history 多次出现不会重复入库。
    主消息新落库时异步触发自动回复(不阻塞 SSE 流)。
    """
    data = event.get("data") or {}
    chat_id = data.get("chat_id")
    if not chat_id:
        logger.warning("qixin_msg_no_chat_id", user_id=user_id, raw=str(event)[:200])
        return

    chat_type = data.get("chat_type")  # "direct" | "group"
    sender = data.get("from") or {}
    history = data.get("history_messages") or []
    if not isinstance(history, list):
        history = []

    # 主消息 text 优先 data.text;兼容 data.message.content
    text = data.get("text")
    if not text:
        inner = data.get("message") or {}
        text = inner.get("content") or ""

    main_msg_id = data.get("message_id")
    ts = _parse_ts(data.get("timestamp") or data.get("date"))

    logger.info(
        "qixin_msg_in_raw",
        user_id=user_id,
        chat_id=chat_id,
        chat_type=chat_type,
        sender_id=sender.get("id"),
        sender_name=sender.get("name"),
        history_count=len(history),
        text_preview=(text or "")[:40],
    )

    chat_id_s = str(chat_id)
    main_inserted = False
    try:
        async with async_session_maker() as session:
            # 主消息
            main_inserted = await _add_message_if_new(
                session,
                user_id=user_id,
                gateway_message_id=str(main_msg_id) if main_msg_id else None,
                chat_id=chat_id_s,
                chat_type=chat_type,
                sender_user_id=str(sender.get("id")) if sender.get("id") else None,
                sender_name=sender.get("name"),
                direction="in",
                content=text or "",
                raw=data,
                ts=ts,
            )
            # 群聊历史(协议透传的 @ 前最近 10 条;私聊一般没有)
            new_history = 0
            for h in history:
                if not isinstance(h, dict):
                    continue
                h_id = h.get("message_id")
                if not h_id:
                    continue  # 没 id 无法去重,跳过
                inserted = await _add_message_if_new(
                    session,
                    user_id=user_id,
                    gateway_message_id=str(h_id),
                    chat_id=chat_id_s,
                    chat_type=chat_type,
                    sender_user_id=str(h.get("sender_id") or h.get("full_sender_id") or "") or None,
                    sender_name=None,  # history 协议没带 sender name
                    direction="in",
                    content=h.get("content") or "",
                    raw=h,
                    ts=_parse_ts(h.get("message_timestamp")),
                )
                if inserted:
                    new_history += 1
            await session.commit()
            if new_history:
                logger.info(
                    "qixin_history_persisted",
                    user_id=user_id,
                    chat_id=chat_id,
                    fresh_history=new_history,
                    total_history=len(history),
                )
    except Exception as e:
        logger.error("qixin_msg_persist_failed", user_id=user_id, error=str(e))

    # 主消息新入库时触发自动 RAG 回复(不阻塞 SSE 流)
    if main_inserted and _should_auto_reply(user_id, sender, text):
        asyncio.create_task(
            _auto_reply(user_id, chat_id_s, chat_type, text, main_msg_id),
            name=f"qixin-autoreply-{user_id}-{main_msg_id}",
        )


def _should_auto_reply(user_id: str, sender: dict, text: str) -> bool:
    """判断这条消息是否触发自动回复。

    跳过:
    - 文本空或单字
    - 发送人是 Bot 自己(echo 防护;Gateway 一般不会推 out,保险起见)
    """
    if not text or not text.strip():
        return False
    # 群聊里 @Bot 之后实际内容可能很短;但单字号(?\\!)无意义
    if len(text.strip()) < 2:
        return False
    conn = _pool.get(user_id)
    if conn is None:
        return True  # 池里没缓存就别拦,_auto_reply 里临时 client 会处理
    bot_id = conn.client.bot_full_id
    sender_id = sender.get("id") if isinstance(sender, dict) else None
    if bot_id and sender_id and str(sender_id) == str(bot_id):
        logger.info("qixin_autoreply_skip_self_echo", user_id=user_id, sender_id=sender_id)
        return False
    return True


async def _auto_reply(
    user_id: str,
    chat_id: str,
    chat_type: str | None,
    raw_text: str,
    in_message_id: str | None,
) -> None:
    """调 kb_agent.answer_question(限定 user 可见文档)→ send_message_for_user 回发。

    群聊 text 通常是 "@Bot名 真问题",剥掉前缀再问。
    LLM 失败 / 检索为空时静默不发(避免在群里说没用的话)。
    """
    import re
    from agents.kb_agent import answer_question

    question = re.sub(r"^@\S+\s+", "", raw_text or "").strip()
    if len(question) < 2:
        return

    logger.info(
        "qixin_autoreply_start",
        user_id=user_id,
        chat_id=chat_id,
        chat_type=chat_type,
        q_preview=question[:60],
    )
    try:
        result = await answer_question(question=question, user_id=user_id)
    except Exception as e:
        logger.error("qixin_autoreply_rag_failed", user_id=user_id, chat_id=chat_id, error=str(e))
        return

    answer = (result or {}).get("answer") or ""
    if not answer.strip():
        logger.info("qixin_autoreply_empty_answer", user_id=user_id, chat_id=chat_id)
        return
    # 内容过长截断(企信单条上限 4000 字符,留余量)
    if len(answer) > 3500:
        answer = answer[:3500] + "\n…(回答过长已截断)"

    try:
        await send_message_for_user(
            user_id,
            chat_id,
            answer,
            reply_message_id=in_message_id,
        )
        logger.info(
            "qixin_autoreply_sent",
            user_id=user_id,
            chat_id=chat_id,
            answer_len=len(answer),
        )
    except Exception as e:
        logger.error("qixin_autoreply_send_failed", user_id=user_id, chat_id=chat_id, error=str(e))


async def _add_message_if_new(
    session,
    *,
    user_id: str,
    gateway_message_id: str | None,
    chat_id: str,
    chat_type: str | None,
    sender_user_id: str | None,
    sender_name: str | None,
    direction: str,
    content: str,
    raw: dict | None,
    ts,
) -> bool:
    """如果 (user_id, gateway_message_id) 不存在就 add,返 True;已存在返 False。

    依赖 partial unique index uq_qixin_msg_gid 做最终兜底(race 时 IntegrityError)。
    没 gateway_message_id 的(比如 out 消息)直接 add,不去重。
    """
    from sqlalchemy import select as _sel
    if gateway_message_id:
        existing = await session.execute(
            _sel(QixinMessage.id)
            .where(
                QixinMessage.user_id == user_id,
                QixinMessage.gateway_message_id == gateway_message_id,
            )
            .limit(1)
        )
        if existing.scalar_one_or_none():
            return False
    msg = QixinMessage(
        user_id=user_id,
        gateway_message_id=gateway_message_id,
        chat_id=chat_id,
        chat_type=chat_type,
        sender_user_id=sender_user_id,
        sender_name=sender_name,
        direction=direction,
        content=content,
        raw=raw,
        ts=ts,
    )
    session.add(msg)
    return True


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
