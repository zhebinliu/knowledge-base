"""场景 ↔ AI 能力 自动匹配(Block6 增强)。

给每个标准场景,从纷享已预研的 96 个 AI 能力里挑出「确有帮助」的作为该场景的 AI 优化选择。
按域分批调 LLM(每域一次:该域全部场景 + 全量能力目录),把结果落到 scene.ai_capabilities。
宁缺毋滥:不相关就不选。
"""
from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from models.scene import StandardScene, AiCapability
from services.model_router import model_router, ModelOutputError
from services.llm_json import loads_lenient

logger = structlog.get_logger()

_SYSTEM = """你是纷享销客 CRM 实施专家。给你两样东西:
1. 一份「AI 能力目录」——纷享已预研的 AI 能力,每个含 id / 领域 / Agent / 技能名 / 作用说明。
2. 一批「业务场景」——每个含 编码 / 名称 / 所属阶段。

任务:为每个场景匹配**确有帮助**的 AI 能力(作为该场景的「AI 优化选择」)。
规则:
- 宁缺毋滥:只选真正能优化该场景执行/效率/质量的能力;不相关就不选,可以是空。
- 一个场景通常 0-4 个能力,别硬凑。
- 只能用目录里给出的能力 id。

输出严格 JSON(不要解释、不要代码围栏):
{"场景编码": [能力id, ...], ...}
没有任何匹配的场景可以不出现在结果里。"""


def _catalog(caps: list[AiCapability]) -> str:
    lines = []
    for c in caps:
        desc = (c.description or "").replace("\n", " ")[:80]
        lines.append(f"- id={c.id} [{c.domain}] {c.agent}/{c.skill}:{desc}")
    return "\n".join(lines)


def _scene_block(scenes: list[StandardScene]) -> str:
    return "\n".join(f"- {s.code} {s.name}(阶段:{s.stage_label or s.stage})" for s in scenes)


_CHUNK = 10  # 每次 LLM 只处理 ≤10 个场景,避免大域(LTC 48)输出截断


async def _match_one_batch(catalog: str, group: list[StandardScene], valid_ids: set[int]) -> dict:
    """一批场景 → {code: [ids]}。失败重试一次,仍失败返回 {}。"""
    user = f"## AI 能力目录\n{catalog}\n\n## 业务场景\n{_scene_block(group)}"
    for attempt in (1, 2):
        try:
            content, _m = await model_router.chat_with_routing(
                task="scene_ai_match",
                messages=[{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}],
                temperature=0.2, max_tokens=8000,
            )
            parsed = loads_lenient(content or "", None)
            if isinstance(parsed, dict):
                return parsed
        except Exception as e:  # noqa: BLE001
            logger.warning("scene_ai_match_llm_fail", attempt=attempt, n=len(group), error=str(e)[:150])
    return {}


async def auto_match_capabilities(session: AsyncSession, domain: str | None = None) -> dict:
    """对场景(可按域过滤)自动匹配 AI 能力并落库(权威覆盖:每个场景都写,含空)。"""
    caps = (await session.execute(select(AiCapability).order_by(AiCapability.sort))).scalars().all()
    if not caps:
        return {"matched_scenes": 0, "assignments": 0, "per_domain": {}, "note": "AI 能力目录为空"}
    valid_ids = {c.id for c in caps}
    catalog = _catalog(caps)

    stmt = select(StandardScene).where(StandardScene.status == "active")
    if domain:
        stmt = stmt.where(StandardScene.domain == domain)
    scenes = (await session.execute(
        stmt.order_by(StandardScene.domain, StandardScene.stage, StandardScene.code)
    )).scalars().all()

    total_matched = 0
    total_assign = 0
    per_domain: dict[str, int] = {}
    # 按域分组,再切 ≤_CHUNK 的小批
    by_domain: dict[str, list[StandardScene]] = {}
    for s in scenes:
        by_domain.setdefault(s.domain, []).append(s)

    for dom, group in by_domain.items():
        dom_matched = 0
        for i in range(0, len(group), _CHUNK):
            batch = group[i:i + _CHUNK]
            parsed = await _match_one_batch(catalog, batch, valid_ids)
            for s in batch:
                ids = parsed.get(s.code) or parsed.get(str(s.code)) or []
                clean = sorted({int(x) for x in ids
                                if isinstance(x, (int, float, str)) and str(x).isdigit() and int(x) in valid_ids}) \
                    if isinstance(ids, list) else []
                s.ai_capabilities = clean          # 权威覆盖
                flag_modified(s, "ai_capabilities")
                if clean:
                    dom_matched += 1
                    total_assign += len(clean)
        per_domain[dom] = dom_matched
        total_matched += dom_matched
        logger.info("scene_ai_match_domain_done", domain=dom, matched=dom_matched, total=len(group))

    await session.commit()
    return {"matched_scenes": total_matched, "assignments": total_assign, "per_domain": per_domain}
