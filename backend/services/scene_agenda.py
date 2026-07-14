"""项目调研议程(2026-07-14 Part2)。

从项目「应覆盖场景」生成调研议程:按域 / 阶段列场景 + 每场景「关键调研问题」+ 覆盖状态。
- 应覆盖场景:场景命中报告里有命中的「活跃域」的全部场景(未跑命中则可按域查看)。
  活跃域里已命中的是「已识别」,未命中的正是「待调研缺口」——议程要顾问照着补齐。
- 覆盖状态:场景编码是否在最新命中报告的 hits 里。

同一份「应覆盖场景 + 问题」也喂给会议 Copilot 做定向引导(Part3 复用本模块)。
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


async def _hit_report(session: AsyncSession, project_id: str) -> SceneHitReport | None:
    return (await session.execute(
        select(SceneHitReport).where(SceneHitReport.project_id == project_id)
    )).scalar_one_or_none()


async def build_project_agenda(
    project_id: str, session: AsyncSession, domain: str | None = None,
) -> dict:
    """项目应覆盖场景 → 议程结构(按域/阶段 + 每场景问题 + 覆盖状态)。"""
    report = await _hit_report(session, project_id)
    hit_codes: set[str] = set()
    active_domains: set[str] = set()
    if report:
        for h in (report.hits or []):
            if h.get("code"):
                hit_codes.add(h["code"])
            if h.get("domain"):
                active_domains.add(h["domain"])

    stmt = select(StandardScene).where(StandardScene.status == "active")
    if domain:
        stmt = stmt.where(StandardScene.domain == domain)
    elif active_domains:
        stmt = stmt.where(StandardScene.domain.in_(active_domains))
    scenes = (await session.execute(
        stmt.order_by(StandardScene.domain, StandardScene.stage, StandardScene.code)
    )).scalars().all()

    by_domain: dict[str, list[StandardScene]] = {}
    for s in scenes:
        by_domain.setdefault(s.domain, []).append(s)
    dom_keys = [d for d in _DOMAIN_ORDER if d in by_domain] + \
               [d for d in by_domain if d not in _DOMAIN_ORDER]

    domains_out: list[dict] = []
    total = covered_total = 0
    for dom in dom_keys:
        group = by_domain[dom]
        stages: dict[str, dict] = {}
        dom_covered = 0
        for s in group:
            covered = s.code in hit_codes
            if covered:
                dom_covered += 1
            st_key = s.stage or ""
            stages.setdefault(st_key, {
                "stage": st_key, "stage_label": s.stage_label or s.stage or "其他", "scenes": [],
            })["scenes"].append({
                "id": s.id, "code": s.code, "name": s.name,
                "covered": covered,
                "questions": s.research_questions or [],
                "question_count": len(s.research_questions or []),
            })
        total += len(group)
        covered_total += dom_covered
        domains_out.append({
            "domain": dom, "label": DOMAIN_LABEL.get(dom, dom),
            "active": dom in active_domains,
            "scene_count": len(group), "covered_count": dom_covered,
            "stages": list(stages.values()),
        })

    return {
        "project_id": project_id,
        "has_match": report is not None,
        "total_scenes": total,
        "covered_scenes": covered_total,
        "domains": domains_out,
    }


def scene_guidance_text(agenda: dict, only_gaps: bool = True, max_scenes: int = 40) -> str:
    """把议程压成一段喂给会议 Copilot 的「定向引导」文本(Part3)。

    only_gaps=True:优先列「待调研(未覆盖)」场景——会中该问却还没问的;
      覆盖满了则退回列全部,避免空。max_scenes 控 prompt 体量。
    """
    lines: list[str] = []
    picked = 0
    pools: list[list[dict]] = []  # 先 gap 后 covered
    gaps, covereds = [], []
    for d in agenda.get("domains", []):
        for st in d.get("stages", []):
            for sc in st.get("scenes", []):
                item = {**sc, "domain": d["domain"], "label": d["label"], "stage_label": st["stage_label"]}
                (gaps if not sc.get("covered") else covereds).append(item)
    pools = [gaps, covereds] if only_gaps else [gaps + covereds]
    if only_gaps and not gaps:
        pools = [covereds]

    for pool in pools:
        for sc in pool:
            if picked >= max_scenes:
                break
            qs = sc.get("questions") or []
            qtext = ("|".join(qs[:4])) if qs else ""
            flag = "待调研" if not sc.get("covered") else "已覆盖"
            line = f"- [{flag}] {sc['domain']}·{sc['code']} {sc['name']}"
            if qtext:
                line += f" — 该问:{qtext}"
            lines.append(line)
            picked += 1
    return "\n".join(lines)
