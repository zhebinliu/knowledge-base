"""会议纪要模板 CRUD 与演化 API。

提供模板列表、创建、激活以及触发模板演化的端点。
由宿主 kb-system 的 main.py 注册::

    from api.template import router as template_router
    app.include_router(template_router, prefix="/api/templates", tags=["templates"])
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, text as _text
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.template import MeetingTemplate
from services.ai.template_evolver import TemplateEvolver, _template_to_dict

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Pydantic Schemas ──────────────────────────────────────────────────────


class TemplateCreate(BaseModel):
    """手动创建模板的请求体。"""
    name: str = Field(default="自定义模板")
    description: str = Field(default="")
    schema_structure: str = Field(default="")
    format_requirements: str = Field(default="")
    style_preferences: str = Field(default="")
    change_log: str = Field(default="")


# ── 辅助 ──────────────────────────────────────────────────────────────────


async def _run_evolve(method: str) -> None:
    """后台模板演化任务。"""
    try:
        evolver = TemplateEvolver()
        template = await evolver.evolve(method=method)
        logger.info(
            "Template evolution completed: v%s (id=%s)",
            template.version, template.id,
        )
    except Exception:  # noqa: BLE001
        logger.exception("Template evolution background task failed")


# ── Endpoints ────────────────────────────────────────────────────────────


@router.get("", response_model=list[dict])
async def list_templates(
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    """列出所有模板，按版本降序。"""
    result = await db.execute(
        select(MeetingTemplate).order_by(MeetingTemplate.version.desc())
    )
    templates = list(result.scalars().all())
    return [_template_to_dict(t) for t in templates]


@router.get("/active", response_model=dict)
async def get_active_template(
    db: AsyncSession = Depends(get_session),
) -> dict:
    """返回当前活跃模板，若无则返回空 dict。"""
    result = await db.execute(
        select(MeetingTemplate)
        .where(MeetingTemplate.is_active == True)  # noqa: E712
        .limit(1)
    )
    tpl = result.scalar_one_or_none()
    if tpl is None:
        return {}
    return _template_to_dict(tpl)


@router.get("/{template_id}", response_model=dict)
async def get_template(
    template_id: int,
    db: AsyncSession = Depends(get_session),
) -> dict:
    """按 ID 获取单个模板。"""
    tpl = await db.get(MeetingTemplate, template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    return _template_to_dict(tpl)


@router.post("", response_model=dict, status_code=201)
async def create_template(
    payload: TemplateCreate,
    db: AsyncSession = Depends(get_session),
) -> dict:
    """手动创建新模板（不自动激活）。"""
    latest_result = await db.execute(
        select(MeetingTemplate).order_by(MeetingTemplate.version.desc()).limit(1)
    )
    latest = latest_result.scalar_one_or_none()
    next_version = (latest.version + 1) if latest else 1

    template = MeetingTemplate(
        name=payload.name,
        description=payload.description,
        schema_structure=payload.schema_structure,
        format_requirements=payload.format_requirements,
        style_preferences=payload.style_preferences,
        version=next_version,
        is_active=False,
        source_meeting_ids="[]",
        source_kb_doc_refs="[]",
        evolution_method="manual",
        change_log=payload.change_log or "手动创建",
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    logger.info("Created template id=%s v%s", template.id, template.version)
    return _template_to_dict(template)


@router.post("/{template_id}/activate", response_model=dict)
async def activate_template(
    template_id: int,
    db: AsyncSession = Depends(get_session),
) -> dict:
    """激活某模板（会去激活其他所有模板）。"""
    tpl = await db.get(MeetingTemplate, template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="模板不存在")

    await db.execute(
        _text("UPDATE meeting_templates SET is_active = false WHERE is_active = true")
    )
    tpl.is_active = True
    await db.commit()
    await db.refresh(tpl)
    logger.info("Activated template id=%s v%s", tpl.id, tpl.version)
    return _template_to_dict(tpl)


@router.post("/evolve", response_model=dict)
async def evolve_template(
    background_tasks: BackgroundTasks,
    method: str = Query(
        default="combined",
        description="演化方式: user_edit / kb_analysis / combined",
    ),
) -> dict:
    """后台触发模板演化。

    演化过程:
    1. 收集用户编辑过的会议 + KB 会议文档。
    2. 调用 LLM 分析并推导改进的模板。
    3. 创建新模板版本并自动激活。
    """
    if method not in ("user_edit", "kb_analysis", "combined"):
        raise HTTPException(
            status_code=400,
            detail=f"无效的 method '{method}'。允许值: user_edit, kb_analysis, combined。",
        )
    background_tasks.add_task(_run_evolve, method)
    return {
        "status": "evolution_scheduled",
        "method": method,
        "message": "模板演化已在后台启动。轮询 GET /api/templates/active 查看新版本。",
    }
