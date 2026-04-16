from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from models import get_session
from models.chunk import Chunk

router = APIRouter()


class ChunkUpdateRequest(BaseModel):
    content: str | None = None
    ltc_stage: str | None = None
    industry: str | None = None
    module: str | None = None
    tags: list[str] | None = None


@router.get("")
async def list_chunks(
    ltc_stage: str | None = Query(None),
    industry: str | None = Query(None),
    review_status: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    session: AsyncSession = Depends(get_session),
):
    q = select(Chunk)
    if ltc_stage:
        q = q.where(Chunk.ltc_stage == ltc_stage)
    if industry:
        q = q.where(Chunk.industry == industry)
    if review_status:
        q = q.where(Chunk.review_status == review_status)
    q = q.order_by(Chunk.created_at.desc()).offset(offset).limit(limit)
    result = await session.execute(q)
    chunks = result.scalars().all()
    return [
        {
            "id": c.id, "document_id": c.document_id, "content": c.content[:300],
            "ltc_stage": c.ltc_stage, "industry": c.industry, "module": c.module,
            "tags": c.tags, "review_status": c.review_status,
            "chunk_index": c.chunk_index, "char_count": c.char_count,
        }
        for c in chunks
    ]


@router.get("/{chunk_id}")
async def get_chunk(chunk_id: str, session: AsyncSession = Depends(get_session)):
    chunk = await session.get(Chunk, chunk_id)
    if not chunk:
        raise HTTPException(404, "切片不存在")
    return chunk.__dict__


@router.put("/{chunk_id}")
async def update_chunk(chunk_id: str, req: ChunkUpdateRequest, session: AsyncSession = Depends(get_session)):
    chunk = await session.get(Chunk, chunk_id)
    if not chunk:
        raise HTTPException(404, "切片不存在")
    if req.content is not None:
        chunk.content = req.content
        chunk.char_count = len(req.content)
        # 重新 embedding
        from services.embedding_service import embedding_service
        from services.vector_store import vector_store
        vector = await embedding_service.embed(req.content)
        await vector_store.upsert(chunk.id, vector, {"content_preview": req.content[:500], "ltc_stage": chunk.ltc_stage, "industry": chunk.industry})
    if req.ltc_stage is not None:
        chunk.ltc_stage = req.ltc_stage
    if req.industry is not None:
        chunk.industry = req.industry
    if req.module is not None:
        chunk.module = req.module
    if req.tags is not None:
        chunk.tags = req.tags
    await session.commit()
    return {"ok": True}


@router.patch("/{chunk_id}/tags")
async def update_tags(chunk_id: str, tags: list[str], session: AsyncSession = Depends(get_session)):
    chunk = await session.get(Chunk, chunk_id)
    if not chunk:
        raise HTTPException(404, "切片不存在")
    chunk.tags = tags
    await session.commit()
    return {"ok": True}
