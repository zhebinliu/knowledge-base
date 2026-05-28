"""Admin API to view API/MCP/LLM call logs。

datetime 字段的 UTC 序列化由 main.py 全局 patch ENCODERS_BY_TYPE 统一处理,
这里直接塞 datetime 对象即可。
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.api_call_log import ApiCallLog
from services.auth import require_admin

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get("")
async def list_call_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    call_type: str | None = Query(None),
    user_id: str | None = Query(None),
    model_name: str | None = Query(None),
    caller_module: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(ApiCallLog)
    count_stmt = select(func.count()).select_from(ApiCallLog)

    if call_type:
        stmt = stmt.where(ApiCallLog.call_type == call_type)
        count_stmt = count_stmt.where(ApiCallLog.call_type == call_type)
    if user_id:
        stmt = stmt.where(ApiCallLog.user_id == user_id)
        count_stmt = count_stmt.where(ApiCallLog.user_id == user_id)
    if model_name:
        stmt = stmt.where(ApiCallLog.model_name == model_name)
        count_stmt = count_stmt.where(ApiCallLog.model_name == model_name)
    if caller_module:
        stmt = stmt.where(ApiCallLog.caller_module.ilike(f"%{caller_module}%"))
        count_stmt = count_stmt.where(ApiCallLog.caller_module.ilike(f"%{caller_module}%"))

    total = await session.scalar(count_stmt)
    rows = (await session.execute(
        stmt.order_by(ApiCallLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "username": r.username,
                "token_type": r.token_type,
                "call_type": r.call_type,
                "endpoint": r.endpoint,
                "status_code": r.status_code,
                "created_at": r.created_at,
                "model_name": r.model_name,
                "caller_module": r.caller_module,
                "task": r.task,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "duration_ms": r.duration_ms,
                "error_message": r.error_message,
            }
            for r in rows
        ],
    }


@router.get("/llm/stats")
async def llm_stats(
    since_hours: int = Query(24, ge=1, le=720),
    session: AsyncSession = Depends(get_session),
):
    """LLM 调用统计:按 model_name 汇总,过去 N 小时。"""
    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(hours=since_hours)
    rows = (await session.execute(
        select(
            ApiCallLog.model_name,
            func.count().label("calls"),
            func.coalesce(func.sum(ApiCallLog.input_tokens), 0).label("in_tokens"),
            func.coalesce(func.sum(ApiCallLog.output_tokens), 0).label("out_tokens"),
            func.avg(ApiCallLog.duration_ms).label("avg_ms"),
            func.sum(
                case((ApiCallLog.error_message.is_not(None), 1), else_=0)
            ).label("errors"),
        )
        .where(ApiCallLog.call_type == "llm")
        .where(ApiCallLog.created_at >= cutoff)
        .group_by(ApiCallLog.model_name)
        .order_by(func.count().desc())
    )).all()
    return {
        "since_hours": since_hours,
        "models": [
            {
                "model_name": r.model_name,
                "calls": int(r.calls or 0),
                "input_tokens": int(r.in_tokens or 0),
                "output_tokens": int(r.out_tokens or 0),
                "avg_duration_ms": int(r.avg_ms) if r.avg_ms is not None else None,
                "errors": int(r.errors or 0),
            }
            for r in rows
        ],
    }
