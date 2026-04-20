from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
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
    conditions = []
    if ltc_stage:
        conditions.append(Chunk.ltc_stage == ltc_stage)
    if industry:
        conditions.append(Chunk.industry == industry)
    if review_status:
        conditions.append(Chunk.review_status == review_status)

    count_q = select(func.count()).select_from(Chunk)
    if conditions:
        count_q = count_q.where(*conditions)
    total = (await session.execute(count_q)).scalar_one()

    q = select(Chunk)
    if conditions:
        q = q.where(*conditions)
    q = q.order_by(Chunk.created_at.desc()).offset(offset).limit(limit)
    chunks = (await session.execute(q)).scalars().all()

    return {
        "total": total,
        "items": [
            {
                "id": c.id, "document_id": c.document_id, "content": c.content[:300],
                "ltc_stage": c.ltc_stage, "industry": c.industry, "module": c.module,
                "tags": c.tags, "review_status": c.review_status,
                "chunk_index": c.chunk_index, "char_count": c.char_count,
                "generated_by_model": c.generated_by_model,
            }
            for c in chunks
        ],
    }


@router.get("/{chunk_id}")
async def get_chunk(chunk_id: str, session: AsyncSession = Depends(get_session)):
    chunk = await session.get(Chunk, chunk_id)
    if not chunk:
        raise HTTPException(404, "切片不存在")
    return {
        "id": chunk.id, "document_id": chunk.document_id, "content": chunk.content,
        "chunk_index": chunk.chunk_index, "ltc_stage": chunk.ltc_stage,
        "ltc_stage_confidence": chunk.ltc_stage_confidence, "industry": chunk.industry,
        "module": chunk.module, "tags": chunk.tags, "source_section": chunk.source_section,
        "char_count": chunk.char_count, "review_status": chunk.review_status,
        "reviewed_by": chunk.reviewed_by, "reviewed_at": chunk.reviewed_at,
        "generated_by_model": chunk.generated_by_model, "vector_id": chunk.vector_id,
        "created_at": chunk.created_at, "updated_at": chunk.updated_at,
    }


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
        await vector_store.upsert(chunk.id, vector, {
            "chunk_id": chunk.id, "document_id": chunk.document_id,
            "content_preview": req.content[:500],
            "ltc_stage": chunk.ltc_stage, "industry": chunk.industry,
        })
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
