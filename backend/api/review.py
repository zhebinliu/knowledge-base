from datetime import datetime
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
        select(ReviewQueue).where(ReviewQueue.status == "pending").order_by(ReviewQueue.created_at)
    )
    items = result.scalars().all()
    return [{"id": i.id, "chunk_id": i.chunk_id, "reason": i.reason, "created_at": i.created_at} for i in items]


@router.post("/{review_id}/approve")
async def approve(review_id: str, action: ReviewAction, session: AsyncSession = Depends(get_session)):
    item = await session.get(ReviewQueue, review_id)
    if not item:
        raise HTTPException(404, "审核项不存在")
    chunk = await session.get(Chunk, item.chunk_id)
    if chunk:
        chunk.review_status = "approved"
        chunk.reviewed_by = action.reviewer
        chunk.reviewed_at = datetime.utcnow()
    item.status = "approved"
    item.reviewed_by = action.reviewer
    item.reviewed_at = datetime.utcnow()
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
        chunk.reviewed_at = datetime.utcnow()
    item.status = "rejected"
    item.review_note = action.note
    item.reviewed_at = datetime.utcnow()
    await session.commit()
    return {"ok": True}
