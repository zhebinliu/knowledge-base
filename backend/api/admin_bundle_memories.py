"""管理员后台:修订学习记忆 CRUD。

数据流见 backend/services/revision_learning.py 顶部 docstring。
本 API 给前端「偏好库」管理页面用,仅 is_admin=True 用户可访问。

支持操作:
- GET    /admin/bundle-memories                 列表(可按 kind 筛选)
- GET    /admin/bundle-memories/kinds           kind 维度计数(便于做 tab 角标)
- PATCH  /admin/bundle-memories/{id}            修改 enabled / notes_md
- DELETE /admin/bundle-memories/{id}            硬删除(默认建议 disable 而非 delete)
"""
from typing import Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.user import User
from models.bundle_revision_memory import BundleRevisionMemory
from models.curated_bundle import CuratedBundle
from models.project import Project
from models.user import User as UserModel
from services.auth import get_current_user
from services._time import iso_utc

logger = structlog.get_logger()
router = APIRouter()

_ALLOWED_KINDS = ("blueprint_design", "object_field_layout", "process_setup", "research_report")
KindLiteral = Literal["blueprint_design", "object_field_layout", "process_setup", "research_report"]


def _ensure_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(403, "仅管理员可访问修订学习记忆管理")


async def _mem_dto(mem: BundleRevisionMemory, session: AsyncSession) -> dict:
    """DTO 输出,附带来源 bundle / project / user 的展示信息(便于前端列表)。"""
    bundle_title = None
    project_name = None
    username = None

    if mem.source_bundle_id:
        b = await session.get(CuratedBundle, mem.source_bundle_id)
        if b:
            bundle_title = b.title

    if mem.source_project_id:
        p = await session.get(Project, mem.source_project_id)
        if p:
            project_name = p.name

    if mem.source_user_id:
        u = await session.get(UserModel, mem.source_user_id)
        if u:
            username = u.username or u.email

    return {
        "id": mem.id,
        "bundle_kind": mem.bundle_kind,
        "source_bundle_id": mem.source_bundle_id,
        "source_bundle_title": bundle_title,
        "source_project_id": mem.source_project_id,
        "source_project_name": project_name,
        "source_user_id": mem.source_user_id,
        "source_username": username,
        "notes_md": mem.notes_md,
        "enabled": mem.enabled,
        "original_chars": mem.original_chars,
        "new_chars": mem.new_chars,
        "llm_model": mem.llm_model,
        "created_at": iso_utc(mem.created_at),
        "updated_at": iso_utc(mem.updated_at),
    }


@router.get("/bundle-memories")
async def list_memories(
    kind: KindLiteral | None = Query(default=None, description="按 bundle 类型筛选"),
    enabled: bool | None = Query(default=None, description="按启停状态筛选,不传则全部"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    _ensure_admin(user)

    q = select(BundleRevisionMemory)
    if kind:
        q = q.where(BundleRevisionMemory.bundle_kind == kind)
    if enabled is not None:
        q = q.where(BundleRevisionMemory.enabled.is_(enabled))
    q = q.order_by(BundleRevisionMemory.created_at.desc()).limit(limit).offset(offset)

    rows = (await session.execute(q)).scalars().all()
    items = [await _mem_dto(r, session) for r in rows]

    # 同样的过滤条件下的总数,便于前端分页
    count_q = select(func.count(BundleRevisionMemory.id))
    if kind:
        count_q = count_q.where(BundleRevisionMemory.bundle_kind == kind)
    if enabled is not None:
        count_q = count_q.where(BundleRevisionMemory.enabled.is_(enabled))
    total = (await session.execute(count_q)).scalar() or 0

    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/bundle-memories/kinds")
async def kinds_summary(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """每个 kind 的启用/停用计数,给前端 tab 做角标。"""
    _ensure_admin(user)

    summary: dict[str, dict] = {}
    for k in _ALLOWED_KINDS:
        enabled_count = (await session.execute(
            select(func.count(BundleRevisionMemory.id))
            .where(BundleRevisionMemory.bundle_kind == k)
            .where(BundleRevisionMemory.enabled.is_(True))
        )).scalar() or 0
        total_count = (await session.execute(
            select(func.count(BundleRevisionMemory.id))
            .where(BundleRevisionMemory.bundle_kind == k)
        )).scalar() or 0
        summary[k] = {"enabled": enabled_count, "total": total_count}
    return {"summary": summary}


class UpdateMemoryIn(BaseModel):
    enabled: bool | None = None
    notes_md: str | None = Field(default=None, max_length=3000)


@router.patch("/bundle-memories/{memory_id}")
async def update_memory(
    memory_id: str,
    payload: UpdateMemoryIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    _ensure_admin(user)

    mem = await session.get(BundleRevisionMemory, memory_id)
    if not mem:
        raise HTTPException(404, "记忆不存在")

    changed = False
    if payload.enabled is not None and payload.enabled != mem.enabled:
        mem.enabled = payload.enabled
        changed = True
    if payload.notes_md is not None and payload.notes_md.strip() and payload.notes_md != mem.notes_md:
        mem.notes_md = payload.notes_md.strip()
        changed = True

    if changed:
        await session.commit()
        logger.info("bundle_memory_updated", memory_id=memory_id,
                    enabled=mem.enabled, by_user=user.username)

    return await _mem_dto(mem, session)


@router.delete("/bundle-memories/{memory_id}")
async def delete_memory(
    memory_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    _ensure_admin(user)

    mem = await session.get(BundleRevisionMemory, memory_id)
    if not mem:
        raise HTTPException(404, "记忆不存在")

    await session.delete(mem)
    await session.commit()
    logger.info("bundle_memory_deleted", memory_id=memory_id, kind=mem.bundle_kind,
                by_user=user.username)
    return {"ok": True}
