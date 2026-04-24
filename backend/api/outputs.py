"""API for output center: generate and retrieve CuratedBundles."""
import io
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.curated_bundle import CuratedBundle
from services.auth import get_current_user
from models.user import User

router = APIRouter()

KIND_TO_TASK = {
    "kickoff_pptx": "generate_kickoff_pptx",
    "survey": "generate_survey",
    "insight": "generate_insight",
}

KIND_TITLES = {
    "kickoff_pptx": "启动会 PPT",
    "survey": "调研问卷",
    "insight": "项目洞察报告",
}


class GenerateRequest(BaseModel):
    kind: str
    project_id: str


def _bundle_dto(b: CuratedBundle) -> dict:
    return {
        "id": b.id,
        "kind": b.kind,
        "project_id": b.project_id,
        "title": b.title,
        "status": b.status,
        "error": b.error,
        "has_content": bool(b.content_md),
        "has_file": bool(b.file_key),
        "created_at": b.created_at,
        "updated_at": b.updated_at,
    }


@router.post("/generate", status_code=202)
async def generate_output(
    body: GenerateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if body.kind not in KIND_TO_TASK:
        raise HTTPException(400, f"Invalid kind. Must be one of: {list(KIND_TO_TASK)}")

    from models.project import Project
    proj = await session.get(Project, body.project_id)
    if not proj:
        raise HTTPException(404, "Project not found")

    title = f"{KIND_TITLES[body.kind]} · {proj.name}"
    bundle = CuratedBundle(
        kind=body.kind,
        project_id=body.project_id,
        title=title,
        status="pending",
        created_by=current_user.id,
        created_by_name=current_user.username,
    )
    session.add(bundle)
    await session.commit()
    await session.refresh(bundle)

    # Fire Celery task
    from tasks.output_tasks import generate_kickoff_pptx, generate_survey, generate_insight
    task_fn = {"kickoff_pptx": generate_kickoff_pptx, "survey": generate_survey, "insight": generate_insight}[body.kind]
    task_fn.delay(bundle.id, body.project_id)

    return _bundle_dto(bundle)


@router.get("")
async def list_outputs(
    project_id: str | None = Query(None),
    kind: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(CuratedBundle)
    count_stmt = select(func.count()).select_from(CuratedBundle)

    # Non-admins see only their own outputs
    if not current_user.is_admin:
        stmt = stmt.where(CuratedBundle.created_by == current_user.id)
        count_stmt = count_stmt.where(CuratedBundle.created_by == current_user.id)

    if project_id:
        stmt = stmt.where(CuratedBundle.project_id == project_id)
        count_stmt = count_stmt.where(CuratedBundle.project_id == project_id)
    if kind:
        stmt = stmt.where(CuratedBundle.kind == kind)
        count_stmt = count_stmt.where(CuratedBundle.kind == kind)

    total = await session.scalar(count_stmt)
    rows = (await session.execute(
        stmt.order_by(CuratedBundle.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).scalars().all()

    return {"total": total, "page": page, "page_size": page_size, "items": [_bundle_dto(b) for b in rows]}


@router.get("/{bundle_id}")
async def get_output(
    bundle_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    if not current_user.is_admin and b.created_by != current_user.id:
        raise HTTPException(403, "Access denied")
    dto = _bundle_dto(b)
    dto["content_md"] = b.content_md
    return dto


@router.get("/{bundle_id}/download")
async def download_output(
    bundle_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    if not current_user.is_admin and b.created_by != current_user.id:
        raise HTTPException(403, "Access denied")
    if b.status != "done":
        raise HTTPException(400, f"Bundle not ready (status={b.status})")

    if b.file_key:
        from config import settings
        from minio import Minio
        mc = Minio(settings.minio_endpoint, access_key=settings.minio_user, secret_key=settings.minio_password, secure=False)
        try:
            response = mc.get_object(settings.minio_bucket, b.file_key)
            data = response.read()
        except Exception as e:
            raise HTTPException(500, f"Failed to fetch file: {e}")

        if b.file_key.endswith(".pptx"):
            media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            filename = f"{b.title}.pptx"
        elif b.file_key.endswith(".docx"):
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            filename = f"{b.title}.docx"
        else:
            media_type = "application/octet-stream"
            filename = b.title

        return StreamingResponse(
            io.BytesIO(data),
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    elif b.content_md:
        # Download as markdown
        return StreamingResponse(
            io.BytesIO(b.content_md.encode("utf-8")),
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{b.title}.md"'},
        )
    else:
        raise HTTPException(400, "No downloadable content available")
