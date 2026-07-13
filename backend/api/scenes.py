"""标准场景库 API（场景库中心）。

2026-07-13 · Harness P3/P4 底座。挂 /api/scenes:
- GET /api/scenes                 列出场景(可 domain / q 过滤)
- GET /api/scenes/domains         各域场景数概览
- GET /api/scenes/{id}            单场景详情
- GET /api/scenes/{id}/changes    单场景变更历史
- GET /api/scene-changes          全库最近变更历史(何时/哪个项目/新增或优化)

seed_scenes_if_empty:首启从 backend/data/scenes_seed.json 导入标准场景(空表才导)。
"""
import os
import json

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy import select, func

from models import async_session_maker, get_session
from models.scene import StandardScene, SceneChange
from services.auth import get_current_user, require_admin
from models.user import User
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()
router = APIRouter()

_SEED_PATH = os.path.join(os.path.dirname(__file__), "..", "seeds", "scenes_seed.json")


async def seed_scenes_if_empty() -> None:
    """首启导入标准场景库(仅当 standard_scenes 为空)。"""
    async with async_session_maker() as s:
        n = (await s.execute(select(func.count(StandardScene.id)))).scalar_one()
        if n > 0:
            return
        if not os.path.exists(_SEED_PATH):
            logger.warning("scenes_seed_missing", path=_SEED_PATH)
            return
        data = json.load(open(_SEED_PATH, encoding="utf-8"))
        for r in data:
            s.add(StandardScene(
                domain=r.get("domain", ""), stage=r.get("stage", ""),
                stage_label=r.get("stage_label"), code=r.get("code", ""),
                name=r.get("name", ""), summary=r.get("stage_def") or r.get("summary"),
                source_type="standard",
            ))
        await s.commit()
        logger.info("scenes_seeded", count=len(data))


class SceneDto(BaseModel):
    id: int
    domain: str
    stage: str
    stage_label: str | None = None
    code: str
    name: str
    summary: str | None = None
    description: str | None = None
    business_rules: str | None = None
    process: str | None = None
    recommended_fields: list = []
    tags: list = []
    source_type: str
    source_project_name: str | None = None
    status: str
    version: int
    updated_at: datetime


class SceneChangeDto(BaseModel):
    id: int
    scene_id: int | None = None
    scene_code: str
    domain: str | None = None
    change_type: str
    project_name: str | None = None
    summary: str | None = None
    created_by: str | None = None
    created_at: datetime


def _scene_dto(x: StandardScene) -> SceneDto:
    return SceneDto(
        id=x.id, domain=x.domain, stage=x.stage, stage_label=x.stage_label,
        code=x.code, name=x.name, summary=x.summary,
        description=x.description, business_rules=x.business_rules, process=x.process,
        recommended_fields=x.recommended_fields or [], tags=x.tags or [],
        source_type=x.source_type,
        source_project_name=x.source_project_name, status=x.status, version=x.version,
        updated_at=x.updated_at,
    )


@router.get("/scenes/domains", dependencies=[Depends(get_current_user)])
async def scene_domains(session: AsyncSession = Depends(get_session)):
    """各域场景数(概览卡)。"""
    rows = (await session.execute(
        select(StandardScene.domain, func.count(StandardScene.id))
        .where(StandardScene.status == "active")
        .group_by(StandardScene.domain)
    )).all()
    order = ["LTC", "MTL", "MCR", "MPR", "ITR"]
    counts = {d: n for d, n in rows}
    return {"domains": [{"domain": d, "count": counts.get(d, 0)} for d in order if d in counts]
            + [{"domain": d, "count": n} for d, n in counts.items() if d not in order],
            "total": sum(counts.values())}


@router.get("/scenes", response_model=list[SceneDto], dependencies=[Depends(get_current_user)])
async def list_scenes(
    domain: str | None = Query(None),
    q: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """列出场景(可按域 / 关键词过滤)。"""
    stmt = select(StandardScene).where(StandardScene.status == "active")
    if domain:
        stmt = stmt.where(StandardScene.domain == domain)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(StandardScene.name.ilike(like) | StandardScene.code.ilike(like))
    stmt = stmt.order_by(StandardScene.domain, StandardScene.stage, StandardScene.code)
    rows = (await session.execute(stmt)).scalars().all()
    return [_scene_dto(x) for x in rows]


@router.get("/scenes/{scene_id}", response_model=SceneDto, dependencies=[Depends(get_current_user)])
async def get_scene(scene_id: int, session: AsyncSession = Depends(get_session)):
    x = await session.get(StandardScene, scene_id)
    if not x:
        raise HTTPException(404, "场景不存在")
    return _scene_dto(x)


class SceneUpdateBody(BaseModel):
    name: str | None = None
    description: str | None = None
    business_rules: str | None = None
    process: str | None = None
    recommended_fields: list | None = None   # [{name,type,note,required}]
    tags: list | None = None                 # ["通用" | "L1/L2/L3/L4"...]


_FIELD_LABELS = {
    "name": "名称", "description": "说明", "business_rules": "业务规则",
    "process": "流程", "recommended_fields": "推荐字段", "tags": "标签",
}


@router.patch("/scenes/{scene_id}", response_model=SceneDto, dependencies=[Depends(require_admin)])
async def update_scene(
    scene_id: int,
    body: SceneUpdateBody,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """编辑场景内容/标签(仅管理员)。保存写 SceneChange('edit') 留痕并 bump version。"""
    from sqlalchemy.orm.attributes import flag_modified
    x = await session.get(StandardScene, scene_id)
    if not x:
        raise HTTPException(404, "场景不存在")
    changed: list[str] = []
    for field in ("name", "description", "business_rules", "process", "recommended_fields", "tags"):
        val = getattr(body, field)
        if val is not None and getattr(x, field) != val:
            setattr(x, field, val)
            if field in ("recommended_fields", "tags"):
                flag_modified(x, field)
            changed.append(_FIELD_LABELS[field])
    if not changed:
        return _scene_dto(x)
    x.version = (x.version or 1) + 1
    session.add(SceneChange(
        scene_id=x.id, scene_code=x.code, domain=x.domain, change_type="edit",
        summary=f"编辑:{'、'.join(changed)}", created_by=current_user.username,
    ))
    await session.commit()
    await session.refresh(x)
    logger.info("scene_edited", scene_id=scene_id, fields=changed, by=current_user.username)
    return _scene_dto(x)


@router.get("/scenes/{scene_id}/changes", response_model=list[SceneChangeDto],
            dependencies=[Depends(get_current_user)])
async def scene_change_history(scene_id: int, session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(
        select(SceneChange).where(SceneChange.scene_id == scene_id)
        .order_by(SceneChange.created_at.desc())
    )).scalars().all()
    return [SceneChangeDto(
        id=c.id, scene_id=c.scene_id, scene_code=c.scene_code, domain=c.domain,
        change_type=c.change_type, project_name=c.project_name, summary=c.summary,
        created_by=c.created_by, created_at=c.created_at) for c in rows]


@router.get("/scene-changes", response_model=list[SceneChangeDto],
            dependencies=[Depends(get_current_user)])
async def recent_scene_changes(
    limit: int = Query(100, le=500),
    session: AsyncSession = Depends(get_session),
):
    """全库最近变更历史。"""
    rows = (await session.execute(
        select(SceneChange).order_by(SceneChange.created_at.desc()).limit(limit)
    )).scalars().all()
    return [SceneChangeDto(
        id=c.id, scene_id=c.scene_id, scene_code=c.scene_code, domain=c.domain,
        change_type=c.change_type, project_name=c.project_name, summary=c.summary,
        created_by=c.created_by, created_at=c.created_at) for c in rows]
