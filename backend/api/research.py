"""需求调研 v1 API — 顾问录入答案 + 范围分类触发 + LTC 模块映射查询。

注意:大纲 / 问卷的"生成"复用现有 outputs API(POST /api/outputs/generate
        with kind=survey_outline / survey),走 runner.generate_survey_outline
        / generate_survey 这条已有路径。本路由只负责:
- 顾问录入答案(upsert)
- 拉取已答
- 触发四分类
- 拉取 SOW → LTC 映射结果
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Any
from sqlalchemy import select

from models import async_session_maker
from models.research_response import ResearchResponse
from models.research_ltc_module_map import ResearchLtcModuleMap
from models.curated_bundle import CuratedBundle
from services.auth import get_current_user

logger = structlog.get_logger()
router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class ResponseUpsertBody(BaseModel):
    bundle_id: str
    project_id: str | None = None
    item_key: str = Field(min_length=1, max_length=120)
    answer_value: Any = None
    scope_label: str | None = Field(default=None, pattern=r"^(new|digitize|migrate|out_of_scope)$")
    scope_label_source: str | None = Field(default=None, pattern=r"^(ai|manual)$")


class ResponseDto(BaseModel):
    item_key: str
    answer_value: Any
    scope_label: str | None
    scope_label_source: str | None
    updated_at: str


class ClassifyScopeBody(BaseModel):
    bundle_id: str
    ltc_module_key: str | None = None  # 不传则全部模块都分类一遍


# ── 答案录入 ────────────────────────────────────────────────────────────────

@router.post("/responses", dependencies=[Depends(get_current_user)])
async def upsert_response(body: ResponseUpsertBody, user=Depends(get_current_user)):
    """顾问录入或更新一个答案。按 (bundle_id, item_key) upsert。"""
    async with async_session_maker() as s:
        # 校验 bundle 存在
        b = await s.get(CuratedBundle, body.bundle_id)
        if not b:
            raise HTTPException(404, "bundle 不存在")

        existing = (await s.execute(
            select(ResearchResponse).where(
                ResearchResponse.bundle_id == body.bundle_id,
                ResearchResponse.item_key == body.item_key,
            )
        )).scalar_one_or_none()

        if existing:
            if body.answer_value is not None:
                existing.answer_value = body.answer_value
            if body.scope_label is not None:
                existing.scope_label = body.scope_label
                existing.scope_label_source = body.scope_label_source or "manual"
            existing.updated_by = getattr(user, "id", None)
        else:
            row = ResearchResponse(
                bundle_id=body.bundle_id,
                project_id=body.project_id or b.project_id,
                item_key=body.item_key,
                answer_value=body.answer_value,
                scope_label=body.scope_label,
                scope_label_source=body.scope_label_source,
                updated_by=getattr(user, "id", None),
            )
            s.add(row)
        await s.commit()
    return {"ok": True}


@router.get("/responses", dependencies=[Depends(get_current_user)])
async def list_responses(bundle_id: str):
    """拉取一个 bundle 下所有顾问答案,按 item_key 索引返回。"""
    async with async_session_maker() as s:
        rows = (await s.execute(
            select(ResearchResponse).where(ResearchResponse.bundle_id == bundle_id)
        )).scalars().all()
    return {
        "items": [
            {
                "item_key": r.item_key,
                "answer_value": r.answer_value,
                "scope_label": r.scope_label,
                "scope_label_source": r.scope_label_source,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]
    }


# ── 范围四分类触发 ────────────────────────────────────────────────────────

@router.post("/classify-scope", dependencies=[Depends(get_current_user)])
async def classify_scope(body: ClassifyScopeBody):
    """触发某个 bundle(可指定 LTC 模块)的范围四分类。

    依赖 bundle.extra.questionnaire_items 已生成 + research_responses 已有顾问答案。
    LLM 综合判断 → upsert 到 research_responses.scope_label,source='ai'。
    顾问之前手改过的(source='manual')不覆盖。
    """
    from services.agentic.research.scope_classifier import classify_scope_for_bundle
    result = await classify_scope_for_bundle(
        body.bundle_id,
        ltc_module_key=body.ltc_module_key,
    )
    return {"ok": True, **result}


# ── LTC 模块映射查询 ────────────────────────────────────────────────────────

@router.get("/ltc-module-map", dependencies=[Depends(get_current_user)])
async def list_ltc_module_map(project_id: str):
    """返回项目的 SOW → LTC 字典映射结果。前端工作区显示用。"""
    async with async_session_maker() as s:
        rows = (await s.execute(
            select(ResearchLtcModuleMap)
            .where(ResearchLtcModuleMap.project_id == project_id)
            .order_by(ResearchLtcModuleMap.created_at.desc())
        )).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "sow_term": r.sow_term,
                "mapped_ltc_key": r.mapped_ltc_key,
                "confidence": r.confidence,
                "is_extra": r.is_extra,
            }
            for r in rows
        ]
    }


# ── LTC 字典只读暴露(前端工作区渲染节点池/选项池用) ────────────────────────

@router.get("/ltc-dictionary", dependencies=[Depends(get_current_user)])
async def get_ltc_dictionary():
    """返回 LTC 字典全量。前端工作区左栏渲染模块清单 / 节点池用。"""
    from services.agentic.research.ltc_dictionary import ALL_LTC_MODULES
    return {
        "modules": [m.to_dict() for m in ALL_LTC_MODULES],
    }
