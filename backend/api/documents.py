import uuid
import structlog
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from models import get_session
from models.document import Document
from models.project import DOC_TYPES, DOC_TYPE_LABELS, Project
from models.user import User
from services.auth import get_current_user, get_current_user_optional
from services.rate_limit import limiter

logger = structlog.get_logger()
router = APIRouter()

SUPPORTED_FORMATS = {".docx", ".pdf", ".pptx", ".xlsx", ".csv", ".md", ".txt"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@router.post("/upload")
@limiter.limit("30/minute")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    project_id: str | None = Form(default=None),
    doc_type: str | None = Form(default=None),
    session: AsyncSession = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
):
    filename = file.filename or "unnamed"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in SUPPORTED_FORMATS:
        raise HTTPException(400, f"不支持的格式: {ext}，支持: {', '.join(SUPPORTED_FORMATS)}")

    # 校验 project / doc_type（可选）
    project_id = (project_id or "").strip() or None
    doc_type = (doc_type or "").strip() or None
    doc_industry = None
    if project_id:
        proj = await session.get(Project, project_id)
        if not proj:
            raise HTTPException(400, f"项目不存在: {project_id}")
        doc_industry = proj.industry  # 继承项目行业
    if doc_type and doc_type not in DOC_TYPES:
        raise HTTPException(400, f"未知文档类型 '{doc_type}'，合法值：{list(DOC_TYPES)}")

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
    doc = Document(
        filename=filename,
        original_format=ext.lstrip("."),
        file_path=object_name,
        conversion_status="pending",
        uploader_id=current_user.id if current_user else None,
        project_id=project_id,
        doc_type=doc_type,
        industry=doc_industry,
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)

    # 触发异步任务
    from tasks.convert_task import process_document
    process_document.delay(str(doc.id))

    logger.info(
        "document_uploaded",
        doc_id=doc.id,
        filename=filename,
        uploader=current_user.username if current_user else None,
        project_id=project_id,
        doc_type=doc_type,
    )
    return {"id": doc.id, "filename": filename, "status": "pending"}


@router.get("")
async def list_documents(
    project_id: str | None = Query(default=None, description="按项目筛选；'none' 表示无项目"),
    doc_type: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    # Build base filter conditions
    conditions = []
    if project_id == "none":
        conditions.append(Document.project_id.is_(None))
    elif project_id:
        conditions.append(Document.project_id == project_id)
    if doc_type:
        conditions.append(Document.doc_type == doc_type)

    # Total count
    count_stmt = select(func.count()).select_from(Document)
    if conditions:
        count_stmt = count_stmt.where(*conditions)
    total = (await session.execute(count_stmt)).scalar_one()

    # Paginated rows
    stmt = (
        select(Document, User.username, User.full_name, Project.name)
        .outerjoin(User, Document.uploader_id == User.id)
        .outerjoin(Project, Document.project_id == Project.id)
        .order_by(Document.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if conditions:
        stmt = stmt.where(*conditions)

    rows = (await session.execute(stmt)).all()
    items = [
        {
            "id": d.id,
            "filename": d.filename,
            "original_format": d.original_format,
            "conversion_status": d.conversion_status,
            "conversion_error": d.conversion_error,
            "uploader_id": d.uploader_id,
            "uploader_name": full_name or username,
            "project_id": d.project_id,
            "project_name": project_name,
            "doc_type": d.doc_type,
            "doc_type_label": DOC_TYPE_LABELS.get(d.doc_type) if d.doc_type else None,
            "industry": d.industry,
            "created_at": d.created_at,
            "updated_at": d.updated_at,
        }
        for d, username, full_name, project_name in rows
    ]
    return {"total": total, "items": items}


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
    return {
        "id": doc.id,
        "conversion_status": doc.conversion_status,
        "conversion_error": doc.conversion_error,
        "chunk_count": chunk_count,
    }


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
            "generated_by_model": c.generated_by_model,
        }
        for c in chunks
    ]


@router.patch("/{doc_id}")
async def update_document(
    doc_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
):
    """更新文档的项目归属和/或文档类型。
    body: { project_id?: string | null, doc_type?: string | null }
    """
    doc = await session.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")

    if "project_id" in body:
        pid = body["project_id"] or None
        if pid:
            proj = await session.get(Project, pid)
            if not proj:
                raise HTTPException(400, "项目不存在")
        doc.project_id = pid

    if "doc_type" in body:
        dt = body["doc_type"] or None
        if dt and dt not in DOC_TYPE_LABELS:
            raise HTTPException(400, f"未知文档类型: {dt}")
        doc.doc_type = dt

    if "industry" in body:
        from prompts.ltc_taxonomy import INDUSTRIES
        ind = body["industry"] or None
        if ind and ind not in INDUSTRIES:
            raise HTTPException(400, f"未知行业: {ind}")
        doc.industry = ind

    await session.commit()
    await session.refresh(doc)

    # Return updated project name
    project_name = None
    if doc.project_id:
        proj = await session.get(Project, doc.project_id)
        project_name = proj.name if proj else None

    return {
        "id": doc.id,
        "project_id": doc.project_id,
        "project_name": project_name,
        "doc_type": doc.doc_type,
        "doc_type_label": DOC_TYPE_LABELS.get(doc.doc_type) if doc.doc_type else None,
        "industry": doc.industry,
    }


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
):
    from models.chunk import Chunk
    from services.vector_store import vector_store
    from minio import Minio
    from config import settings

    doc = await session.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")

    chunks = (await session.execute(
        select(Chunk).where(Chunk.document_id == doc_id)
    )).scalars().all()
    for chunk in chunks:
        if chunk.vector_id:
            try:
                await vector_store.delete(chunk.vector_id)
            except Exception as e:
                logger.warning("vector_delete_failed", chunk_id=chunk.id, error=str(e)[:100])

    if doc.file_path:
        try:
            mc = Minio(settings.minio_endpoint, access_key=settings.minio_user,
                       secret_key=settings.minio_password, secure=False)
            mc.remove_object(settings.minio_bucket, doc.file_path)
        except Exception as e:
            logger.warning("minio_delete_failed", path=doc.file_path, error=str(e)[:100])

    await session.delete(doc)
    await session.commit()
    return {"ok": True}


@router.post("/batch-infer-type")
async def batch_infer_doc_type(_user: User = Depends(get_current_user)):
    """对 completed 且 doc_type 为空的文档批量补推断文档类型（异步 Celery 任务）。"""
    from tasks.convert_task import infer_doc_types_batch
    task = infer_doc_types_batch.delay()
    return {"ok": True, "task_id": task.id, "message": "批量推断任务已提交，后台执行中"}
