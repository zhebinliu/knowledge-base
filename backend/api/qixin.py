"""企信 IM 消息读取(2026-05-29)。

只读端点 — 让前端侧边栏展示自己 Bot 收到的会话 + 消息流。
严格按 user_id 过滤,跨用户不可见。

路径:
  GET /api/qixin/conversations  - 当前用户的会话列表(按 chat_id group,返最近一条 + 计数)
  GET /api/qixin/conversations/{chat_id}/messages?limit=50&before=<ts_iso>
      - 时间倒序拉,limit 默认 50,before 用于分页(早于该时间)

Phase 1 不返 raw 字段(payload 大 + PII 风险)。
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.qixin_message import QixinMessage
from models.user import User
from services.auth import get_current_user
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/api/qixin", tags=["qixin"])


def _coalesce_ts(m: QixinMessage) -> str | None:
    """ts 优先,否则 created_at。统一带 +00:00 后缀让前端 new Date() 正确解析。"""
    val = m.ts or m.created_at
    if val is None:
        return None
    return val.replace(tzinfo=None).isoformat() + "+00:00"


@router.get("/conversations")
async def list_conversations(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=200),
):
    """当前用户的企信会话列表。

    按 chat_id group,每行返:chat_id、消息总数、最近一条消息预览 + 时间。
    按"最近消息时间"倒序,最多 limit 个会话。
    """
    # 子查询:每个 chat_id 的最近消息 id(按 created_at 取 max — Postgres distinct on 更好但要绑 chat_id 排序)
    # 改用两步:先 group 拿 chat_id + count + max_created_at,再回头按 max_created_at 拉对应 row。
    # Phase 1 数据量小(单用户 Bot 群聊 + 私聊不过百个 chat),双查询足够。

    agg_stmt = (
        select(
            QixinMessage.chat_id,
            func.count(QixinMessage.id).label("count"),
            func.max(QixinMessage.created_at).label("last_created_at"),
        )
        .where(QixinMessage.user_id == user.id)
        .group_by(QixinMessage.chat_id)
        .order_by(desc("last_created_at"))
        .limit(limit)
    )
    agg_rows = (await session.execute(agg_stmt)).all()
    if not agg_rows:
        return {"conversations": []}

    # 拿每个 chat 最新一条消息的内容预览(单查询用 row_number 也行,Phase 1 简化为 N 查询)
    out = []
    for chat_id, count, _last_created in agg_rows:
        last_msg_stmt = (
            select(QixinMessage)
            .where(and_(QixinMessage.user_id == user.id, QixinMessage.chat_id == chat_id))
            .order_by(desc(QixinMessage.created_at))
            .limit(1)
        )
        last = (await session.execute(last_msg_stmt)).scalar_one_or_none()
        if last is None:
            continue
        out.append({
            "chat_id": chat_id,
            "chat_type": last.chat_type,
            "count": count,
            "last_message": {
                "id": last.id,
                "direction": last.direction,
                "sender_name": last.sender_name,
                "sender_user_id": last.sender_user_id,
                "content_preview": (last.content or "")[:120],
                "ts": _coalesce_ts(last),
            },
        })
    return {"conversations": out}


@router.get("/conversations/{chat_id}/messages")
async def list_messages(
    chat_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=200),
    before: str | None = Query(None, description="ISO 时间,拉早于此时间的消息(分页)"),
):
    """单会话消息流(时间倒序)。"""
    conds = [QixinMessage.user_id == user.id, QixinMessage.chat_id == chat_id]
    if before:
        try:
            before_dt = datetime.fromisoformat(before.replace("Z", "+00:00"))
            # naive UTC 存储,带 tz 的转回 naive
            if before_dt.tzinfo is not None:
                before_dt = before_dt.replace(tzinfo=None)
            conds.append(QixinMessage.created_at < before_dt)
        except ValueError:
            raise HTTPException(400, f"before 参数格式错误: {before}")

    stmt = (
        select(QixinMessage)
        .where(and_(*conds))
        .order_by(desc(QixinMessage.created_at))
        .limit(limit)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return {
        "chat_id": chat_id,
        "messages": [
            {
                "id": m.id,
                "chat_id": m.chat_id,
                "chat_type": m.chat_type,
                "sender_user_id": m.sender_user_id,
                "sender_name": m.sender_name,
                "direction": m.direction,
                "content": m.content,
                "ts": _coalesce_ts(m),
            }
            for m in rows
        ],
    }


class SendMessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    reply_message_id: str | int | None = None


@router.post("/conversations/{chat_id}/send")
async def send_message(
    chat_id: str,
    body: SendMessageIn,
    user: User = Depends(get_current_user),
):
    """手动发消息到指定企信会话(2026-05-29)。

    走当前用户的 Bot REST 上行接口。发完落一条 direction='out'。
    SSE 连接未就绪时尝试 start_for_user 后再发。
    """
    try:
        from services.qixin_gateway.connection_manager import send_message_for_user
        result = await send_message_for_user(
            user.id, chat_id, body.text.strip(), body.reply_message_id,
        )
        return {"status": "ok", "message_id": result.get("message_id"), "chat_id": chat_id}
    except ImportError:
        raise HTTPException(503, "企信连接池未启用")
    except RuntimeError as e:
        # 业务错(凭证未配 / Gateway 返非 0 code)
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("qixin_send_endpoint_failed", user=user.username, chat_id=chat_id)
        raise HTTPException(500, f"发送失败: {e}")
