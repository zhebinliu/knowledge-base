import json
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from models import get_session
from models.chunk import Chunk

router = APIRouter()


class ExportRequest(BaseModel):
    format: str = "json"
    ltc_stage: str | None = None
    industry: str | None = None


@router.post("/export")
async def export_chunks(req: ExportRequest, session: AsyncSession = Depends(get_session)):
    q = select(Chunk).where(Chunk.review_status.in_(["auto_approved", "approved"]))
    if req.ltc_stage:
        q = q.where(Chunk.ltc_stage == req.ltc_stage)
    if req.industry:
        q = q.where(Chunk.industry == req.industry)
    result = await session.execute(q)
    chunks = result.scalars().all()

    data = [
        {
            "id": c.id, "document_id": c.document_id, "content": c.content,
            "ltc_stage": c.ltc_stage, "industry": c.industry, "module": c.module, "tags": c.tags,
        }
        for c in chunks
    ]
    return JSONResponse(content={"chunks": data, "count": len(data)})


@router.get("/logs")
async def export_logs():
    return {"logs": [], "message": "导入导出日志（Phase 3 完善）"}
