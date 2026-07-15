"""交付物场景覆盖校验(2026-07-15 · 闭环②「让 scene-driven 有牙齿」)。

给一份生成产物的正文,对照项目「应覆盖场景」(命中场景)做覆盖校验:LLM 语义判断
正文是否实质性地涉及/设计/调研了每个场景对应的业务(不要求用相同措辞),产出
{应覆盖, 已覆盖, 缺漏场景}。结果按内容指纹缓存到 bundle.extra,内容没变不重判。

用于:产物上挂「场景覆盖 M/N · 漏 K」徽标 + 展开看漏了哪些,提示补上/确认不在范围。
命中报告不存在 / 无命中 → applicable=False(不打扰)。
"""
from __future__ import annotations

import hashlib

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from models.scene import SceneHitReport
from models.curated_bundle import CuratedBundle
from services.model_router import model_router
from services.llm_json import loads_lenient

logger = structlog.get_logger()

_MAX_CONTENT = 18000

_SYSTEM = (
    "你判断一份纷享销客 CRM 实施交付物的正文,覆盖了给定「标准业务场景」中的哪些。\n"
    "规则:\n"
    "1. 只要正文**实质性地涉及 / 调研 / 设计**了某场景对应的业务(不要求用相同措辞、不要求出现场景编码),就算覆盖。\n"
    "2. 只是背景一带而过、或完全没提到,不算覆盖。\n"
    "3. 只输出严格 JSON,不要解释:{\"covered\": [\"场景编码\", ...]}。只列覆盖到的编码。"
)


async def _judge_covered(content: str, hits: list[dict]) -> set:
    scene_lines = "\n".join(f"- {h.get('code')} {h.get('name')}" for h in hits)
    user = (
        f"[交付物正文(截断)]\n{content[:_MAX_CONTENT]}\n\n"
        f"[应覆盖场景]\n{scene_lines}\n\n"
        "判断正文覆盖了哪些场景,返回 {\"covered\": [编码...]}。"
    )
    for attempt in (1, 2):
        try:
            resp, _m = await model_router.chat_with_routing(
                task="scene_match",
                messages=[{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}],
                temperature=0.1, max_tokens=3000,
            )
            parsed = loads_lenient(resp or "", None)
            if isinstance(parsed, dict):
                return {str(c).strip().upper() for c in (parsed.get("covered") or []) if str(c).strip()}
        except Exception as e:  # noqa: BLE001
            logger.warning("scene_coverage_judge_fail", attempt=attempt, error=str(e)[:150])
    return set()


async def bundle_scene_coverage(bundle: CuratedBundle, session: AsyncSession) -> dict:
    """产物 vs 项目命中场景 的语义覆盖校验(按内容指纹缓存)。无命中报告 → applicable=False。"""
    report = (await session.execute(
        select(SceneHitReport).where(SceneHitReport.project_id == bundle.project_id)
    )).scalar_one_or_none()
    hits = (report.hits or []) if report else []
    if not hits:
        return {"applicable": False, "total": 0, "covered": 0, "missing": []}

    content = bundle.content_md or ""
    chash = hashlib.md5((content + "|" + str(len(hits))).encode("utf-8", "ignore")).hexdigest()
    extra = bundle.extra or {}
    cached = extra.get("scene_cov")
    if isinstance(cached, dict) and cached.get("hash") == chash:
        return cached["result"]

    covered_codes = await _judge_covered(content, hits)
    covered, missing = [], []
    for h in hits:
        item = {"domain": h.get("domain"), "code": str(h.get("code") or ""), "name": str(h.get("name") or "")}
        (covered if item["code"].upper() in covered_codes else missing).append(item)
    result = {
        "applicable": True, "total": len(hits), "covered": len(covered),
        "covered_ratio": round(len(covered) / len(hits), 2) if hits else None,
        "missing": missing,
    }
    # 缓存到 bundle.extra
    bundle.extra = {**extra, "scene_cov": {"hash": chash, "result": result}}
    flag_modified(bundle, "extra")
    await session.commit()
    logger.info("scene_coverage_judged", bundle_id=bundle.id, covered=len(covered), total=len(hits))
    return result
