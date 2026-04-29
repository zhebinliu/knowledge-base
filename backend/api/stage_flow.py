"""项目流程(Stage Flow)动态配置 API。

存储:复用 AgentConfig 表
- config_type='stage_flow'
- config_key='default'
- config_value: { "stages": [ {key, label, kind, icon, active, beta, sub_kinds}, ... ] }

读取:不存在时 lazy-init 写入 DEFAULT_STAGES。
更新:全量替换(简单)+ 校验(active stage 必须有 kind 或 sub_kinds)。
所有写操作要求管理员;读操作允许已登录用户。
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Literal
from sqlalchemy import select

from models import async_session_maker
from models.agent_config import AgentConfig
from services.auth import require_admin, get_current_user

logger = structlog.get_logger()
router = APIRouter()


# ── 默认流程(从原 ConsoleProjectDetail.tsx STAGES 抽出来)─────────────────────

DEFAULT_STAGES: list[dict] = [
    {"key": "insight",       "label": "项目洞察",          "kind": "insight",      "icon": "Lightbulb",     "active": True,  "beta": False, "sub_kinds": []},
    {"key": "kickoff",       "label": "启动会·PPT",        "kind": "kickoff_pptx", "icon": "FileText",      "active": True,  "beta": False, "sub_kinds": []},
    {"key": "kickoff_html",  "label": "启动会·HTML",       "kind": "kickoff_html", "icon": "FileText",      "active": True,  "beta": False, "sub_kinds": []},
    {"key": "survey",        "label": "需求调研",          "kind": "survey",       "icon": "ClipboardList", "active": True,  "beta": False, "sub_kinds": []},
    {"key": "insight_v2",    "label": "项目洞察(新版)",  "kind": "insight_v2",   "icon": "Bot",           "active": True,  "beta": True,  "sub_kinds": []},
    {"key": "survey_v2",     "label": "需求调研(新版)",  "kind": None,           "icon": "Bot",           "active": True,  "beta": True,
     "sub_kinds": [
         {"kind": "survey_outline_v2", "label": "调研大纲"},
         {"kind": "survey_v2",         "label": "调研问卷"},
     ]},
    {"key": "design",        "label": "方案设计",          "kind": None, "icon": "FileText", "active": False, "beta": False, "sub_kinds": []},
    {"key": "implement",     "label": "项目实施",          "kind": None, "icon": "FileText", "active": False, "beta": False, "sub_kinds": []},
    {"key": "test",          "label": "上线测试",          "kind": None, "icon": "FileText", "active": False, "beta": False, "sub_kinds": []},
    {"key": "acceptance",    "label": "项目验收",          "kind": None, "icon": "FileText", "active": False, "beta": False, "sub_kinds": []},
]

# 允许的图标 — 前端按 string name 映射到 lucide-react 组件
ALLOWED_ICONS = {
    "FileText", "Lightbulb", "ClipboardList", "Bot", "Sparkles",
    "Search", "Settings", "Box", "MessageSquare", "Target",
    "Calendar", "Package", "Users", "CheckCircle2",
}

# 允许的 kind(对齐 backend/api/outputs.py KIND_TO_TASK)
ALLOWED_KINDS = {
    "kickoff_pptx", "kickoff_html", "survey", "insight",
    "insight_v2", "survey_v2", "survey_outline_v2",
}

CONFIG_TYPE = "stage_flow"
CONFIG_KEY = "default"


# ── Schemas ────────────────────────────────────────────────────────────────────

class SubKindDef(BaseModel):
    kind: str
    label: str = Field(min_length=1, max_length=40)


class StageDef(BaseModel):
    key: str = Field(min_length=1, max_length=40, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(min_length=1, max_length=40)
    kind: str | None = None
    icon: str = "FileText"
    active: bool = True
    beta: bool = False
    sub_kinds: list[SubKindDef] = []


class StageFlowConfig(BaseModel):
    stages: list[StageDef]


class StageFlowDto(BaseModel):
    stages: list[StageDef]
    is_default: bool      # 是否走的硬编码默认(尚未保存过自定义)


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _read() -> tuple[list[dict], bool]:
    """返回 (stages, is_default)。不存在则返回硬编码默认。"""
    async with async_session_maker() as s:
        row = (await s.execute(
            select(AgentConfig).where(
                AgentConfig.config_type == CONFIG_TYPE,
                AgentConfig.config_key == CONFIG_KEY,
            )
        )).scalar_one_or_none()
    if row and isinstance(row.config_value, dict) and isinstance(row.config_value.get("stages"), list):
        return row.config_value["stages"], False
    return DEFAULT_STAGES, True


def _validate(stages: list[StageDef]) -> None:
    """业务校验:active stage 必须可触发;key 唯一;icon/kind 在白名单内。"""
    keys = set()
    for s in stages:
        if s.key in keys:
            raise HTTPException(400, f"重复的 key: {s.key}")
        keys.add(s.key)
        if s.icon not in ALLOWED_ICONS:
            raise HTTPException(400, f"不支持的图标: {s.icon}(允许:{', '.join(sorted(ALLOWED_ICONS))})")
        if s.kind is not None and s.kind not in ALLOWED_KINDS:
            raise HTTPException(400, f"不支持的产物类型: {s.kind}")
        for sk in s.sub_kinds:
            if sk.kind not in ALLOWED_KINDS:
                raise HTTPException(400, f"子产物类型 {sk.kind} 不在白名单")
        if s.active and s.kind is None and not s.sub_kinds:
            raise HTTPException(400, f"已启用的阶段「{s.label}」必须配置产物 kind 或子产物 sub_kinds")
    if not stages:
        raise HTTPException(400, "至少要保留一个阶段")


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/stage-flow", response_model=StageFlowDto, dependencies=[Depends(get_current_user)])
async def get_stage_flow():
    """读取项目流程配置。所有登录用户可读(前台 ConsoleProjectDetail 也要用)。"""
    stages, is_default = await _read()
    return {"stages": stages, "is_default": is_default}


@router.put("/stage-flow", dependencies=[Depends(require_admin)])
async def put_stage_flow(body: StageFlowConfig):
    """全量替换。仅管理员。"""
    _validate(body.stages)
    payload = {"stages": [s.model_dump() for s in body.stages]}
    async with async_session_maker() as s:
        row = (await s.execute(
            select(AgentConfig).where(
                AgentConfig.config_type == CONFIG_TYPE,
                AgentConfig.config_key == CONFIG_KEY,
            )
        )).scalar_one_or_none()
        if row:
            row.config_value = payload
        else:
            s.add(AgentConfig(
                config_type=CONFIG_TYPE,
                config_key=CONFIG_KEY,
                config_value=payload,
                description="项目阶段流程动态配置(/console/projects/:id 顶部阶段栏的来源)",
            ))
        await s.commit()
    logger.info("stage_flow_updated", stages_n=len(body.stages))
    return {"ok": True, "stages_n": len(body.stages)}


@router.post("/stage-flow/reset", dependencies=[Depends(require_admin)])
async def reset_stage_flow():
    """重置为内置默认(物理删除自定义配置,下次 GET 走硬编码默认)。"""
    async with async_session_maker() as s:
        row = (await s.execute(
            select(AgentConfig).where(
                AgentConfig.config_type == CONFIG_TYPE,
                AgentConfig.config_key == CONFIG_KEY,
            )
        )).scalar_one_or_none()
        if row:
            await s.delete(row)
            await s.commit()
    logger.info("stage_flow_reset")
    return {"ok": True}


@router.get("/stage-flow/meta", dependencies=[Depends(get_current_user)])
async def get_stage_flow_meta():
    """返回元信息:可选的 icon / kind 列表。前端编辑器下拉用。"""
    return {
        "icons": sorted(ALLOWED_ICONS),
        "kinds": sorted(ALLOWED_KINDS),
        "kind_titles": {
            "kickoff_pptx": "启动会 PPT",
            "kickoff_html": "启动会 HTML",
            "survey": "调研问卷(旧版)",
            "insight": "项目洞察(旧版)",
            "insight_v2": "项目洞察(新版)",
            "survey_v2": "调研问卷(新版)",
            "survey_outline_v2": "调研大纲(新版)",
        },
    }
