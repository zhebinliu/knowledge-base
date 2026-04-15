import uuid
import structlog
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import get_session
from models.document import Document

logger = structlog.get_logger()
router = APIRouter()

SUPPORTED_FORMATS = {".docx", ".pdf", ".pptx", ".xlsx", ".csv", ".md", ".txt"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    filename = file.filename or "unnamed"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in SUPPORTED_FORMATS:
        raise HTTPException(400, f"不支持的格式: {ext}，支持: {', '.join(SUPPORTED_FORMATS)}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "文件超过 50MB 限制")

    # 存入 MinIO
    from minio import Minio
    from config import settings
    minio_client = Minio(settings.minio_endpoint, access_key=settings.minio_user, secret_key=settings.minio_password, secure=False)
    object_name = f"raw/{uuid.uuid4()}/{filename}"
    import io
    minio_client.put_object(settings.minio_bucket, object_name, io.BytesIO(content), len(content))

    # 写数据库
    doc = Document(filename=filename, original_format=ext.lstrip("."), file_path=object_name, conversion_status="pending")
    session.add(doc)
    await session.commit()
    await session.refresh(doc)

    # 触发异步任务
    from tasks.convert_task import process_document
    process_document.delay(doc.id)

    logger.info("document_uploaded", doc_id=doc.id, filename=filename)
    return {"id": doc.id, "filename": filename, "status": "pending"}


@router.get("")
async def list_documents(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Document).order_by(Document.created_at.desc()))
    docs = result.scalars().all()
    return [{"id": d.id, "filename": d.filename, "status": d.conversion_status, "created_at": d.created_at} for d in docs]


@router.get("/{doc_id}")
async def get_document(doc_id: str, session: AsyncSession = Depends(get_session)):
    doc = await session.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")
    return {"id": doc.id, "filename": doc.filename, "status": doc.conversion_status, "markdown_content": doc.markdown_content}


@router.get("/{doc_id}/status")
async def get_document_status(doc_id: str, session: AsyncSession = Depends(get_session)):
    from models.chunk import Chunk
    from sqlalchemy import func
    doc = await session.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")
    chunk_count = await session.scalar(select(func.count()).select_from(Chunk).where(Chunk.document_id == doc_id))
    return {"id": doc.id, "conversion_status": doc.conversion_status, "chunk_count": chunk_count}


@router.get("/{doc_id}/chunks")
async def get_document_chunks(doc_id: str, session: AsyncSession = Depends(get_session)):
    from models.chunk import Chunk
    doc = await session.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")
    result = await session.execute(
        select(Chunk).where(Chunk.document_id == doc_id).order_by(Chunk.chunk_index)
    )
    chunks = result.scalars().all()
    return [
        {
            "id": c.id,
            "chunk_index": c.chunk_index,
            "content": c.content,
            "ltc_stage": c.ltc_stage,
            "industry": c.industry,
            "module": c.module,
            "tags": c.tags,
            "char_count": c.char_count,
            "review_status": c.review_status,
        }
        for c in chunks
    ]


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, session: AsyncSession = Depends(get_session)):
    doc = await session.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")
    await session.delete(doc)
    await session.commit()
    return {"ok": True}
