"""项目库 API：CRUD + 项目下文档列表。"""
from datetime import date

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.document import Document
from models.project import DOC_TYPE_LABELS, DOC_TYPES, Project
from models.user import User
from prompts.ltc_taxonomy import MODULE_TAGS, INDUSTRIES
from services.auth import get_current_user

logger = structlog.get_logger()
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    customer: str | None = None
    industry: str | None = None
    modules: list[str] | None = None
    kickoff_date: date | None = None
    description: str | None = None


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    customer: str | None = None
    industry: str | None = None
    modules: list[str] | None = None
    kickoff_date: date | None = None
    description: str | None = None


def _project_dto(p: Project, doc_count: int = 0) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "customer": p.customer,
        "industry": p.industry,
        "modules": p.modules or [],
        "kickoff_date": p.kickoff_date.isoformat() if p.kickoff_date else None,
        "description": p.description,
        "created_by": p.created_by,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
        "document_count": doc_count,
    }


def _validate_modules(modules: list[str] | None) -> list[str] | None:
    if modules is None:
        return None
    bad = [m for m in modules if m not in MODULE_TAGS]
    if bad:
        raise HTTPException(400, f"未知模块：{bad}（合法模块见 /api/projects/meta）")
    # 去重保序
    seen, out = set(), []
    for m in modules:
        if m not in seen:
            seen.add(m); out.append(m)
    return out


def _validate_industry(industry: str | None) -> str | None:
    if industry is None or industry == "":
        return None
    if industry not in INDUSTRIES:
        raise HTTPException(400, f"未知行业：{industry}")
    return industry


# ── Meta ─────────────────────────────────────────────────────────────────────

@router.get("/meta")
async def project_meta():
    """前端下拉用：合法模块 + 文档类型枚举 + 行业枚举。"""
    from prompts.ltc_taxonomy import INDUSTRY_TAGS
    return {
        "modules": list(MODULE_TAGS),
        "doc_types": [{"value": v, "label": DOC_TYPE_LABELS[v]} for v in DOC_TYPES],
        "industries": [{"value": k, "label": v} for k, v in INDUSTRY_TAGS.items()],
    }


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("")
async def list_projects(session: AsyncSession = Depends(get_session)):
    # 一次拉项目 + 各项目文档数（LEFT JOIN GROUP BY）
    stmt = (
        select(Project, func.count(Document.id))
        .outerjoin(Document, Document.project_id == Project.id)
        .group_by(Project.id)
        .order_by(Project.created_at.desc())
    )
    rows = (await session.execute(stmt)).all()
    return [_project_dto(p, doc_count=cnt or 0) for p, cnt in rows]


@router.post("", status_code=201)
async def create_project(
    body: ProjectIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    modules = _validate_modules(body.modules)
    industry = _validate_industry(body.industry)
    p = Project(
        name=body.name.strip(),
        customer=(body.customer or "").strip() or None,
        industry=industry,
        modules=modules,
        kickoff_date=body.kickoff_date,
        description=body.description,
        created_by=user.id,
    )
    session.add(p)
    await session.commit()
    await session.refresh(p)
    logger.info("project_created", id=p.id, name=p.name, by=user.username)
    return _project_dto(p, doc_count=0)


@router.get("/{project_id}")
async def get_project(project_id: str, session: AsyncSession = Depends(get_session)):
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    cnt = await session.scalar(
        select(func.count(Document.id)).where(Document.project_id == project_id)
    )
    return _project_dto(p, doc_count=cnt or 0)


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectPatch,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
):
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    if body.name is not None:
        p.name = body.name.strip()
    if body.customer is not None:
        p.customer = body.customer.strip() or None
    if body.industry is not None:
        p.industry = _validate_industry(body.industry)
    if body.modules is not None:
        p.modules = _validate_modules(body.modules)
    if body.kickoff_date is not None:
        p.kickoff_date = body.kickoff_date
    if body.description is not None:
        p.description = body.description
    await session.commit()
    await session.refresh(p)
    cnt = await session.scalar(
        select(func.count(Document.id)).where(Document.project_id == project_id)
    )
    return _project_dto(p, doc_count=cnt or 0)


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    cascade: bool = Query(False, description="true 时一并解除关联文档的 project_id（不删文档本身）"),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
):
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    cnt = await session.scalar(
        select(func.count(Document.id)).where(Document.project_id == project_id)
    ) or 0
    if cnt > 0 and not cascade:
        raise HTTPException(
            409,
            f"项目下还有 {cnt} 个文档；如需继续请加 ?cascade=true（仅解除关联，不删文档）",
        )
    if cnt > 0:
        # 解关联：把这些文档的 project_id 置空
        from sqlalchemy import update as sa_update
        await session.execute(
            sa_update(Document).where(Document.project_id == project_id).values(project_id=None)
        )
    await session.delete(p)
    await session.commit()
    return {"ok": True, "unlinked_documents": cnt}


# ── Documents under project ─────────────────────────────────────────────────

@router.get("/{project_id}/documents")
async def list_project_documents(project_id: str, session: AsyncSession = Depends(get_session)):
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    rows = (await session.execute(
        select(Document, User.username, User.full_name)
        .outerjoin(User, Document.uploader_id == User.id)
        .where(Document.project_id == project_id)
        .order_by(Document.created_at.desc())
    )).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "original_format": d.original_format,
            "conversion_status": d.conversion_status,
            "doc_type": d.doc_type,
            "doc_type_label": DOC_TYPE_LABELS.get(d.doc_type) if d.doc_type else None,
            "uploader_id": d.uploader_id,
            "uploader_name": full_name or username,
            "created_at": d.created_at,
            "updated_at": d.updated_at,
        }
        for d, username, full_name in rows
    ]
