from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from models import get_session
from models.chunk import Chunk
from models.review_queue import ReviewQueue

router = APIRouter()


class ReviewAction(BaseModel):
    reviewer: str = "admin"
    note: str | None = None
    updated_content: str | None = None


@router.get("/queue")
async def get_review_queue(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(ReviewQueue, Chunk)
        .join(Chunk, ReviewQueue.chunk_id == Chunk.id, isouter=True)
        .where(ReviewQueue.status == "pending")
        .order_by(ReviewQueue.created_at)
    )
    rows = result.all()
    return [
        {
            "id": item.id,
            "chunk_id": item.chunk_id,
            "reason": item.reason,
            "created_at": item.created_at,
            "chunk_content": chunk.content if chunk else None,
            "chunk_ltc_stage": chunk.ltc_stage if chunk else None,
            "chunk_index": chunk.chunk_index if chunk else None,
        }
        for item, chunk in rows
    ]


@router.post("/{review_id}/approve")
async def approve(review_id: str, action: ReviewAction, session: AsyncSession = Depends(get_session)):
    item = await session.get(ReviewQueue, review_id)
    if not item:
        raise HTTPException(404, "审核项不存在")
    chunk = await session.get(Chunk, item.chunk_id)
    if chunk:
        chunk.review_status = "approved"
        chunk.reviewed_by = action.reviewer
        chunk.reviewed_at = datetime.now(timezone.utc)
    item.status = "approved"
    item.reviewed_by = action.reviewer
    item.reviewed_at = datetime.now(timezone.utc)
    await session.commit()
    return {"ok": True}


@router.post("/{review_id}/reject")
async def reject(review_id: str, action: ReviewAction, session: AsyncSession = Depends(get_session)):
    item = await session.get(ReviewQueue, review_id)
    if not item:
        raise HTTPException(404, "审核项不存在")
    chunk = await session.get(Chunk, item.chunk_id)
    if chunk:
        chunk.review_status = "rejected"
        chunk.reviewed_by = action.reviewer
        chunk.reviewed_at = datetime.now(timezone.utc)
    item.status = "rejected"
    item.review_note = action.note
    item.reviewed_at = datetime.now(timezone.utc)
    await session.commit()
    return {"ok": True}
