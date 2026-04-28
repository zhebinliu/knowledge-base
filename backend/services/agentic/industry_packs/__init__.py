"""行业字段包:每个行业一个 module,导出 `IndustryPack` 实例。

Planner / Executor 通过 `get_pack(industry)` 拿到行业特定的:
- 字段补丁(注入到 INSIGHT_MODULES 的某些 module fields)
- 典型痛点(Planner 用作"应问问题"提示)
- 标杆案例(Critic 用作"行业最佳实践"对照)
- 行业典型问卷题(Survey Planner 用作种子)
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class IndustryPack:
    industry: str                                            # 与 Project.industry 字段对齐
    display_name: str
    field_patches: dict                                      # {field_key: {label, ask, options?}} — 注入到 insight modules
    pain_points: list[str]                                   # 典型痛点
    cases: list[dict]                                        # [{name, pattern}, ...] 标杆案例
    extra_question_seeds: list[dict]                         # 给 survey planner 用的额外种子
    # 调研大纲(survey_outline_v2)用 — 智能制造典型必访部门 + 行业默认 sessions
    must_visit_departments: list[str] = field(default_factory=list)
    default_sessions: list[dict] = field(default_factory=list)
    typical_customer_materials: list[dict] = field(default_factory=list)


_REGISTRY: dict[str, IndustryPack] = {}


def register(pack: IndustryPack) -> None:
    _REGISTRY[pack.industry] = pack


def get_pack(industry: str | None) -> Optional[IndustryPack]:
    if not industry:
        return None
    return _REGISTRY.get(industry)


def list_packs() -> list[IndustryPack]:
    return list(_REGISTRY.values())


# 注册默认 packs(import 时自动)
from . import smart_manufacturing  # noqa: E402,F401
