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
from models.scene import StandardScene, SceneChange, AiCapability
from services.auth import get_current_user, require_admin
from models.user import User
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()
router = APIRouter()

_SEED_PATH = os.path.join(os.path.dirname(__file__), "..", "seeds", "scenes_seed.json")
_AI_SEED_PATH = os.path.join(os.path.dirname(__file__), "..", "seeds", "ai_capabilities_seed.json")


async def seed_ai_capabilities_if_empty() -> None:
    """首启导入纷享 AI 能力目录(仅当 ai_capabilities 为空)。"""
    async with async_session_maker() as s:
        n = (await s.execute(select(func.count(AiCapability.id)))).scalar_one()
        if n > 0:
            return
        if not os.path.exists(_AI_SEED_PATH):
            logger.warning("ai_capabilities_seed_missing", path=_AI_SEED_PATH)
            return
        data = json.load(open(_AI_SEED_PATH, encoding="utf-8"))
        for r in data:
            s.add(AiCapability(
                domain=r.get("domain", ""), agent=r.get("agent", ""), skill=r.get("skill", ""),
                status=r.get("status", ""), plan_date=r.get("plan_date") or None,
                description=r.get("description"), outputs=r.get("outputs") or [],
                sort=r.get("sort", 0),
            ))
        await s.commit()
        logger.info("ai_capabilities_seeded", count=len(data))


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
    research_questions: list = []    # 关键调研问题(字符串列表)
    tags: list = []
    ai_capabilities: list = []       # 匹配的 AI 能力 id 列表
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
        recommended_fields=x.recommended_fields or [],
        research_questions=x.research_questions or [], tags=x.tags or [],
        ai_capabilities=x.ai_capabilities or [],
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
    research_questions: list | None = None   # ["问题1", ...]
    tags: list | None = None                 # ["通用" | "L1/L2/L3/L4"...]
    ai_capabilities: list | None = None      # [ai_capabilities.id ...]


_FIELD_LABELS = {
    "name": "名称", "description": "说明", "business_rules": "业务规则",
    "process": "流程", "recommended_fields": "推荐字段",
    "research_questions": "关键调研问题", "tags": "标签",
    "ai_capabilities": "AI 能力匹配",
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
    for field in ("name", "description", "business_rules", "process", "recommended_fields",
                  "research_questions", "tags", "ai_capabilities"):
        val = getattr(body, field)
        if val is not None and getattr(x, field) != val:
            setattr(x, field, val)
            if field in ("recommended_fields", "research_questions", "tags", "ai_capabilities"):
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


# ── AI 能力目录(场景 AI 能力匹配的可选项底库)────────────────────────────────

class AiCapabilityDto(BaseModel):
    id: int
    domain: str
    agent: str
    skill: str
    status: str
    plan_date: str | None = None
    description: str | None = None
    outputs: list = []


@router.get("/ai-capabilities", response_model=list[AiCapabilityDto],
            dependencies=[Depends(get_current_user)])
async def list_ai_capabilities(session: AsyncSession = Depends(get_session)):
    """纷享已预研 AI 能力目录(场景 AI 能力匹配用)。"""
    rows = (await session.execute(
        select(AiCapability).order_by(AiCapability.sort)
    )).scalars().all()
    return [AiCapabilityDto(
        id=c.id, domain=c.domain, agent=c.agent, skill=c.skill, status=c.status,
        plan_date=c.plan_date, description=c.description, outputs=c.outputs or []) for c in rows]


@router.post("/scenes/ai-match", dependencies=[Depends(require_admin)])
async def ai_match_scenes(
    domain: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """AI 自动匹配:给场景(可按域)从 AI 能力目录里推荐并落库匹配。仅管理员。"""
    from services.scene_ai_match import auto_match_capabilities
    result = await auto_match_capabilities(session, domain=domain)
    logger.info("scenes_ai_matched", **{k: v for k, v in result.items() if k != "per_domain"})
    return result


# ── 关键调研问题 AI 生成(Part1)──────────────────────────────────────────────

@router.post("/scenes/{scene_id}/gen-questions", dependencies=[Depends(require_admin)])
async def gen_scene_questions(scene_id: int, session: AsyncSession = Depends(get_session)):
    """单场景生成关键调研问题(不落库,前端填入可编辑区)。仅管理员。"""
    from services.scene_questions import gen_questions_for_scene
    x = await session.get(StandardScene, scene_id)
    if not x:
        raise HTTPException(404, "场景不存在")
    questions = await gen_questions_for_scene(session, x)
    return {"questions": questions}


@router.post("/scenes/gen-questions", dependencies=[Depends(require_admin)])
async def batch_gen_scene_questions(
    domain: str | None = Query(None),
    overwrite: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    """批量生成关键调研问题并落库(可按域;默认只补空,overwrite 全量重写)。仅管理员。"""
    from services.scene_questions import auto_gen_questions
    result = await auto_gen_questions(session, domain=domain, overwrite=overwrite)
    logger.info("scene_questions_batch", **{k: v for k, v in result.items() if k != "per_domain"})
    return result
