"""应覆盖场景简报 — 注入到交付物生成上下文,让所有产物按场景闭环组织(2026-07-14)。

从项目最新命中报告(SceneHitReport.hits)取命中场景,按文档类型取对应内容:
- research(调研大纲/问卷/计划/报告):场景 + 关键调研问题
- design(蓝图设计/对象字段表/流程建设表):场景 + 说明/业务规则/流程/推荐字段
- scope(洞察/实施/测试/验收):只列命中场景清单当范围参考

返回一段自带指令头的文本(直接拼进 evidence,无需改各 prompt 模板)。命中没跑过 → 返回 ""。
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.scene import StandardScene, SceneHitReport

DOMAIN_LABEL = {
    "LTC": "线索到回款", "MTL": "市场到线索", "MCR": "客户关系",
    "MPR": "伙伴关系", "ITR": "问题到解决",
}
_DOMAIN_ORDER = ["LTC", "MTL", "MCR", "MPR", "ITR"]

# 文档 kind → facet
KIND_FACET = {
    "survey_outline": "research", "survey": "research", "research_plan": "research",
    "research_report": "research",
    "blueprint_design": "design", "object_field_layout": "design", "process_setup": "design",
    "insight": "scope", "implementation_plan": "scope",
    "test_plan": "scope", "acceptance_report": "scope",
}

_HEADER = {
    "research": (
        "【应覆盖场景 · 调研必读】以下是本项目对照标准场景库判定的「应覆盖场景」+ 每个场景该向客户问清的关键问题。"
        "生成时请**优先按这些场景组织内容**,调研问题**取自这里**,没覆盖到的场景**作为缺口明确点出**。"
    ),
    "design": (
        "【应覆盖场景 · 方案必读】以下是本项目命中的标准场景 + 每个场景的说明/业务规则/流程/推荐字段。"
        "生成方案时请**按这些场景逐一组织**,对象字段参考「推荐字段」、流程参考「场景流程」,别遗漏命中的场景。"
    ),
    "scope": (
        "【应覆盖场景 · 范围参考】本项目命中的标准场景清单,作为交付范围 / 测试点 / 里程碑的对照参考。"
    ),
}

_MAX_TOTAL = 12000   # 简报总字数上限,避免撑爆生成 prompt


async def project_scene_brief(project_id: str, session: AsyncSession, kind: str) -> str:
    """按文档 kind 取对应 facet 的应覆盖场景简报。命中没跑 / 无命中 → 返回 ""。"""
    if not project_id:
        return ""
    facet = KIND_FACET.get(kind)
    if not facet:
        return ""

    report = (await session.execute(
        select(SceneHitReport).where(SceneHitReport.project_id == project_id)
    )).scalar_one_or_none()
    if not report or not (report.hits or []):
        return ""
    hit_keys = {(str(h.get("domain", "")).upper(), str(h.get("code", "")).upper())
                for h in report.hits if h.get("code")}
    if not hit_keys:
        return ""

    scenes = (await session.execute(
        select(StandardScene).where(StandardScene.status == "active")
        .order_by(StandardScene.domain, StandardScene.stage, StandardScene.code)
    )).scalars().all()
    hit_scenes = [s for s in scenes
                  if (s.domain.strip().upper(), s.code.strip().upper()) in hit_keys]
    if not hit_scenes:
        return ""

    by_domain: dict[str, list[StandardScene]] = {}
    for s in hit_scenes:
        by_domain.setdefault(s.domain, []).append(s)
    dom_keys = [d for d in _DOMAIN_ORDER if d in by_domain] + \
               [d for d in by_domain if d not in _DOMAIN_ORDER]

    lines: list[str] = [_HEADER[facet], ""]
    total = len(lines[0])
    for dom in dom_keys:
        group = by_domain[dom]
        lines.append(f"### {dom} {DOMAIN_LABEL.get(dom, '')}(命中 {len(group)})")
        for s in group:
            if total > _MAX_TOTAL:
                lines.append("…(场景较多,余下省略)")
                return "\n".join(lines)
            if facet == "scope":
                row = f"- {s.code} {s.name}"
            elif facet == "research":
                qs = s.research_questions or []
                row = f"- {s.code} {s.name}"
                if qs:
                    row += "\n" + "\n".join(f"  · {q}" for q in qs[:5])
            else:  # design
                row = f"- {s.code} {s.name}"
                parts = []
                if (s.business_rules or "").strip():
                    parts.append(f"业务规则:{s.business_rules.strip()[:200]}")
                if (s.process or "").strip():
                    parts.append(f"流程:{s.process.strip()[:200]}")
                rf = s.recommended_fields or []
                if rf:
                    fnames = "、".join(str(f.get("name", "")) for f in rf if isinstance(f, dict) and f.get("name"))
                    if fnames:
                        parts.append(f"推荐字段:{fnames[:200]}")
                if parts:
                    row += "\n  " + " ; ".join(parts)
            lines.append(row)
            total += len(row)
        lines.append("")
    return "\n".join(lines).strip()
