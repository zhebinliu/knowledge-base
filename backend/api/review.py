from datetime import datetime, timezone
import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from models import get_session
from models.chunk import Chunk
from models.review_queue import ReviewQueue
from services.vector_store import vector_store
from config import settings

logger = structlog.get_logger()

router = APIRouter()


class ReviewAction(BaseModel):
    reviewer: str = "admin"
    note: str | None = None
    updated_content: str | None = None


class BatchApproveRequest(BaseModel):
    reviewer: str = "admin"
    review_ids: list[str] | None = None  # None = 通过当前所有 pending 条


async def _sync_qdrant_review_status(chunk_id: str, review_status: str):
    """Review 决策后同步 Qdrant payload，让检索过滤即时生效。失败不抛错。"""
    try:
        await vector_store.client.set_payload(
            collection_name=settings.qdrant_collection,
            payload={"review_status": review_status},
            points=[chunk_id],
        )
    except Exception as e:
        logger.warning("qdrant_sync_review_status_failed", chunk_id=chunk_id, error=str(e)[:100])


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
            "chunk_ltc_stage_confidence": chunk.ltc_stage_confidence if chunk else None,
            "chunk_index": chunk.chunk_index if chunk else None,
            "chunk_industry": chunk.industry if chunk else None,
            "chunk_module": chunk.module if chunk else None,
            "chunk_tags": chunk.tags if chunk else None,
            "chunk_source_section": chunk.source_section if chunk else None,
            "chunk_generated_by_model": chunk.generated_by_model if chunk else None,
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
        chunk.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    item.status = "approved"
    item.reviewed_by = action.reviewer
    item.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await session.commit()
    if chunk:
        await _sync_qdrant_review_status(chunk.id, "approved")
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
        chunk.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    item.status = "rejected"
    item.review_note = action.note
    item.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await session.commit()
    if chunk:
        await _sync_qdrant_review_status(chunk.id, "rejected")
    return {"ok": True}


@router.post("/batch-approve")
async def batch_approve(req: BatchApproveRequest, session: AsyncSession = Depends(get_session)):
    """批量通过：缺省通过所有 pending 条，或按 review_ids 指定。返回实际通过条数。"""
    q = select(ReviewQueue).where(ReviewQueue.status == "pending")
    if req.review_ids:
        q = q.where(ReviewQueue.id.in_(req.review_ids))
    items = (await session.execute(q)).scalars().all()
    if not items:
        return {"ok": True, "approved": 0}

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    chunk_ids: list[str] = []
    for item in items:
        chunk = await session.get(Chunk, item.chunk_id)
        if chunk:
            chunk.review_status = "approved"
            chunk.reviewed_by = req.reviewer
            chunk.reviewed_at = now
            chunk_ids.append(chunk.id)
        item.status = "approved"
        item.reviewed_by = req.reviewer
        item.reviewed_at = now
    await session.commit()

    # Qdrant 同步：批量 set_payload 避免 N 次 round-trip
    if chunk_ids:
        try:
            await vector_store.client.set_payload(
                collection_name=settings.qdrant_collection,
                payload={"review_status": "approved"},
                points=chunk_ids,
            )
        except Exception as e:
            logger.warning("qdrant_batch_sync_failed", count=len(chunk_ids), error=str(e)[:100])

    return {"ok": True, "approved": len(items)}
