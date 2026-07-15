"""交付物场景覆盖校验(2026-07-15 · 闭环②「让 scene-driven 有牙齿」)。

给一份生成产物的正文,对照项目「应覆盖场景」(命中场景)做覆盖校验:
逐个命中场景看它的名称 / 编码有没有在正文里出现 —— 出现=覆盖到了,没出现=漏了。
产出 {应覆盖, 已覆盖, 缺漏场景}。文本命中即算(轻量、无需再调 LLM),用于:
- 生成后自动跑一遍,日志告警漏覆盖(critic)
- 前端产物上挂「场景覆盖 M/N · 漏 K」徽标 + 展开看漏了哪些

命中报告不存在 / 无命中 → 返回 covered_ratio=None(不适用,不打扰)。
"""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.scene import SceneHitReport


def _norm(s: str) -> str:
    return re.sub(r"[\s\W_]+", "", s or "").lower()


def check_coverage(content_md: str, hits: list[dict]) -> dict:
    """正文 vs 命中场景 → {total, covered, missing:[{domain,code,name}]}。名称或编码命中即算覆盖。"""
    text = content_md or ""
    norm_text = _norm(text)
    covered: list[dict] = []
    missing: list[dict] = []
    for h in hits:
        name = str(h.get("name") or "").strip()
        code = str(h.get("code") or "").strip()
        hit_name = bool(name) and (name in text or (_norm(name) and _norm(name) in norm_text))
        hit_code = bool(code) and code in text
        (covered if (hit_name or hit_code) else missing).append(
            {"domain": h.get("domain"), "code": code, "name": name})
    return {"total": len(hits), "covered": len(covered), "missing": missing}


async def bundle_scene_coverage(project_id: str, content_md: str, session: AsyncSession) -> dict:
    """项目应覆盖场景 vs 产物正文 的覆盖校验。无命中报告 → applicable=False。"""
    report = (await session.execute(
        select(SceneHitReport).where(SceneHitReport.project_id == project_id)
    )).scalar_one_or_none()
    hits = (report.hits or []) if report else []
    if not hits:
        return {"applicable": False, "total": 0, "covered": 0, "missing": []}
    r = check_coverage(content_md, hits)
    r["applicable"] = True
    r["covered_ratio"] = round(r["covered"] / r["total"], 2) if r["total"] else None
    return r
