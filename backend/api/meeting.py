"""Meeting integration — webhook stub (C5.2)."""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()


@router.post("/ingest")
async def ingest_meeting():
    """Webhook for meeting transcript ingestion — not yet implemented."""
    return JSONResponse(status_code=501, content={"detail": "会议纪要接入功能尚未上线，敬请期待。"})
