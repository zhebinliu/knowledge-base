"""场景「关键调研问题」AI 生成(2026-07-14 Part1)。

给标准场景生成一组「关键调研问题」——顾问在需求调研/调研会议时该向客户问清的问题,
覆盖该场景的现状(As-Is)、痛点、关键业务规则、期望目标。按域分批调 LLM。

用途:
- 场景库中心「AI 生成调研问题」批量按钮(auto_gen_questions,落库)。
- 场景编辑抽屉单场景「AI 生成」按钮(gen_questions_for_scene,不落库,前端填入可编辑列表)。
- 下游:项目调研议程(Part2)、会议 Copilot 定向引导(Part3)都取这批问题。
"""
from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from models.scene import StandardScene
from services.model_router import model_router
from services.llm_json import loads_lenient

logger = structlog.get_logger()

_SYSTEM = """你是纷享销客 CRM 实施调研专家。给你一批 CRM 业务场景(每个含 编码 / 名称 / 所属阶段 / 说明)。
为每个场景生成一组「关键调研问题」——顾问在需求调研会上该向客户问清的问题,用来摸清:
- 现状:客户现在这个场景怎么做的(线下 / Excel / 老系统)?谁在做?
- 痛点:哪里最费劲、最容易出错、最想改?
- 规则:关键业务规则 / 判断标准 / 审批口径(例:多少天不跟进算无效线索?超几折要走审批?)。
- 期望:上了 CRM 希望达成什么、用什么衡量。

规则:
- 每个场景 3-6 个问题,具体、可直接照着问,别空泛(不要「你们商机怎么管理?」这种)。
- 问题要能引出可落到系统配置的信息(字段 / 流程节点 / 角色 / 规则阈值)。
- 全部用中文。

输出严格 JSON(不要解释、不要代码围栏):
{"场景编码": ["问题1", "问题2", ...], ...}"""

_CHUNK = 10  # 每次 LLM 只处理 ≤10 个场景,避免大域输出截断


def _scene_block(scenes: list[StandardScene]) -> str:
    out = []
    for s in scenes:
        desc = (s.description or s.summary or "").replace("\n", " ")[:120]
        line = f"- {s.code} {s.name}(阶段:{s.stage_label or s.stage})"
        if desc:
            line += f":{desc}"
        out.append(line)
    return "\n".join(out)


def _clean(qs) -> list[str]:
    if not isinstance(qs, list):
        return []
    out: list[str] = []
    for q in qs:
        t = str(q).strip()
        if t and t not in out:
            out.append(t)
    return out[:8]


async def _gen_batch(group: list[StandardScene]) -> dict:
    """一批场景 → {code: [问题]}。失败重试一次,仍失败返回 {}。"""
    user = f"## 业务场景\n{_scene_block(group)}"
    for attempt in (1, 2):
        try:
            content, _m = await model_router.chat_with_routing(
                task="scene_questions",
                messages=[{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}],
                temperature=0.3, max_tokens=8000,
            )
            parsed = loads_lenient(content or "", None)
            if isinstance(parsed, dict):
                return parsed
        except Exception as e:  # noqa: BLE001
            logger.warning("scene_questions_llm_fail", attempt=attempt, n=len(group), error=str(e)[:150])
    return {}


async def gen_questions_for_scene(session: AsyncSession, scene: StandardScene) -> list[str]:
    """单场景生成(不落库)。前端把返回列表填入可编辑区,用户改完再保存。"""
    parsed = await _gen_batch([scene])
    return _clean(parsed.get(scene.code) or parsed.get(str(scene.code)) or [])


async def auto_gen_questions(
    session: AsyncSession, domain: str | None = None, overwrite: bool = False,
) -> dict:
    """批量生成并落库。默认只补空场景(不覆盖已有);overwrite=True 全量重写。"""
    stmt = select(StandardScene).where(StandardScene.status == "active")
    if domain:
        stmt = stmt.where(StandardScene.domain == domain)
    scenes = (await session.execute(
        stmt.order_by(StandardScene.domain, StandardScene.stage, StandardScene.code)
    )).scalars().all()

    targets = [s for s in scenes if overwrite or not (s.research_questions or [])]
    if not targets:
        return {"generated_scenes": 0, "questions": 0, "skipped": len(scenes), "per_domain": {}}

    by_domain: dict[str, list[StandardScene]] = {}
    for s in targets:
        by_domain.setdefault(s.domain, []).append(s)

    total_scenes = 0
    total_q = 0
    per_domain: dict[str, int] = {}
    for dom, group in by_domain.items():
        dom_n = 0
        for i in range(0, len(group), _CHUNK):
            batch = group[i:i + _CHUNK]
            parsed = await _gen_batch(batch)
            for s in batch:
                qs = _clean(parsed.get(s.code) or parsed.get(str(s.code)) or [])
                if qs:
                    s.research_questions = qs
                    flag_modified(s, "research_questions")
                    dom_n += 1
                    total_q += len(qs)
        per_domain[dom] = dom_n
        total_scenes += dom_n
        await session.commit()   # 每域提交,防长跑中断丢全部进度、也让前端可增量看到
        logger.info("scene_questions_domain_done", domain=dom, generated=dom_n, total=len(group))

    return {
        "generated_scenes": total_scenes, "questions": total_q,
        "skipped": len(scenes) - len(targets), "per_domain": per_domain,
    }
