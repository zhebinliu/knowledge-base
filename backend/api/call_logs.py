"""Admin API to view API/MCP call logs."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
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
            }
            for r in rows
        ],
    }
