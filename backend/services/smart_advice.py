"""项目智能建议 service —— 综合所有项目信息 + 行业 know-how, 生成"下一步建议 + 风险"。

调用方式:
    advice = await get_or_generate_advice(project_id, force=False)

cache 策略:
    1. 算 inputs_hash(brief + outputs + docs + industry + LTC stage)
    2. 如 hash 跟现有一致且不 stale → 直接返回 cache
    3. 否则跑 LLM(deepseek-v4-pro)→ 写回 + 清 stale flag

mark_stale(project_id) 由外部事件调用(文档上传 / 输出物完成 / 编辑 / 问卷),
只标记 is_stale=True, 不立即跑 LLM(懒生成)。
"""
import hashlib
import json
import structlog
from datetime import datetime
from typing import Any
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import async_session_maker
from models.project import Project
from models.project_brief import ProjectBrief
from models.project_smart_advice import SmartAdvice
from models.curated_bundle import CuratedBundle
from models.document import Document
from services._time import utcnow_naive
from services.model_router import model_router
from services.agentic.industry_packs import get_pack
from prompts.ltc_taxonomy import INDUSTRY_TAGS

logger = structlog.get_logger()

# ────────────────────────────────────────────────────────────────────────
# 公共入口
# ────────────────────────────────────────────────────────────────────────

DEFAULT_MODEL = "deepseek-v4-pro"


async def get_or_generate_advice(project_id: str, force: bool = False) -> dict:
    """获取项目智能建议(带 cache)。

    返回 dict 而非 SmartAdvice 对象, 以便 API 直接序列化:
        {
            "project_id", "advice_md", "next_steps", "risks",
            "is_stale", "model_used", "generated_at", "error",
            "is_fresh"  # bool 此次调用是否真的跑了 LLM
        }
    """
    async with async_session_maker() as s:
        # 取现有 advice (如有)
        existing = await _get_advice_row(s, project_id)
        # 算最新 inputs hash
        ctx = await _gather_context(s, project_id)
        new_hash = _compute_hash(ctx)

        # 决策:跑还是不跑 LLM
        need_run = force or existing is None or existing.is_stale or existing.inputs_hash != new_hash

        if not need_run and existing:
            return _row_to_dict(existing, is_fresh=False)

        # 跑 LLM
        try:
            advice_md, next_steps, risks = await _generate_with_llm(ctx)
            error = None
        except Exception as e:
            logger.warning("smart_advice_llm_failed", project_id=project_id, error=str(e)[:200])
            # 失败 — 如果已有旧 advice, 返回旧的并打 error 标记;否则返回空
            advice_md = existing.advice_md if existing else ""
            next_steps = existing.next_steps if existing else []
            risks = existing.risks if existing else []
            error = str(e)[:500]

        # 写回
        if existing:
            existing.advice_md = advice_md
            existing.next_steps = next_steps
            existing.risks = risks
            existing.inputs_hash = new_hash
            existing.is_stale = False
            existing.model_used = DEFAULT_MODEL
            existing.error = error
            existing.generated_at = utcnow_naive()
            row = existing
        else:
            row = SmartAdvice(
                project_id=project_id,
                advice_md=advice_md,
                next_steps=next_steps,
                risks=risks,
                inputs_hash=new_hash,
                is_stale=False,
                model_used=DEFAULT_MODEL,
                error=error,
            )
            s.add(row)

        await s.commit()
        await s.refresh(row)
        return _row_to_dict(row, is_fresh=True)


async def get_advice_only(project_id: str) -> dict | None:
    """只读取(不触发生成)。前端首次轮询用 — 没有就返 None, 让前端决定是否触发生成。"""
    async with async_session_maker() as s:
        existing = await _get_advice_row(s, project_id)
        if not existing:
            return None
        return _row_to_dict(existing, is_fresh=False)


async def mark_stale(project_id: str) -> None:
    """外部事件调用:标记 advice 已过期, 下次 GET 会触发重生成。
    幂等;如该 project 还没 advice, 不报错。"""
    async with async_session_maker() as s:
        existing = await _get_advice_row(s, project_id)
        if existing and not existing.is_stale:
            existing.is_stale = True
            await s.commit()
            logger.info("smart_advice_marked_stale", project_id=project_id)


# ────────────────────────────────────────────────────────────────────────
# 内部 helper
# ────────────────────────────────────────────────────────────────────────


async def _get_advice_row(s: AsyncSession, project_id: str) -> SmartAdvice | None:
    res = await s.execute(select(SmartAdvice).where(SmartAdvice.project_id == project_id))
    return res.scalar_one_or_none()


def _row_to_dict(row: SmartAdvice, is_fresh: bool) -> dict:
    return {
        "project_id": row.project_id,
        "advice_md": row.advice_md,
        "next_steps": row.next_steps or [],
        "risks": row.risks or [],
        "is_stale": row.is_stale,
        "model_used": row.model_used,
        "error": row.error,
        "generated_at": row.generated_at.isoformat() if row.generated_at else None,
        "is_fresh": is_fresh,
    }


async def _gather_context(s: AsyncSession, project_id: str) -> dict[str, Any]:
    """收集生成 advice 所需的 inputs — 核心是「项目状态(stage flow)」+「行业包详细 spec」, 其他作辅助。"""
    proj = await s.get(Project, project_id)
    if not proj:
        raise ValueError(f"project not found: {project_id}")

    # ── 1. 已生成 outputs (用于推算 stage status) ──
    bundles_res = await s.execute(
        select(CuratedBundle)
        .where(CuratedBundle.project_id == project_id, CuratedBundle.status == "done")
        .order_by(CuratedBundle.created_at.desc())
    )
    bundles = bundles_res.scalars().all()
    done_kinds = {b.kind for b in bundles}

    # ── 2. 项目状态(完整 stage flow + 当前阶段)── 核心 context #1
    stage_flow_status = await _gather_stage_flow_status(done_kinds)

    # ── 3. 行业包(详细字段 spec)── 核心 context #2
    industry_pack_detail = _gather_industry_pack_detail(proj.industry)

    # ── 4. 辅助 inputs ──
    # Brief 各 kind
    briefs_res = await s.execute(
        select(ProjectBrief).where(ProjectBrief.project_id == project_id)
    )
    briefs = {b.output_kind: b.fields for b in briefs_res.scalars()}

    outputs_summary = [
        {
            "kind": b.kind,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        }
        for b in bundles
    ]

    # 已上传文档
    docs_res = await s.execute(
        select(Document.id, Document.filename, Document.doc_type, Document.created_at)
        .where(Document.project_id == project_id)
        .order_by(Document.created_at.desc())
    )
    docs = [
        {"filename": r.filename, "doc_type": r.doc_type, "created_at": r.created_at.isoformat() if r.created_at else None}
        for r in docs_res.all()
    ]

    return {
        "project": {
            "id": proj.id,
            "name": proj.name,
            "customer": proj.customer,
            "industry": proj.industry,
            "industry_label": INDUSTRY_TAGS.get(proj.industry or "", proj.industry or ""),
            "modules": proj.modules,
            "description": proj.description,
            "customer_profile": proj.customer_profile,
            "kickoff_date": proj.kickoff_date.isoformat() if proj.kickoff_date else None,
        },
        # —— 核心 context #1:项目状态(完整阶段流程 + 当前位于哪一步)——
        "project_status": stage_flow_status,
        # —— 核心 context #2:行业包(详细字段 spec)——
        "industry_pack": industry_pack_detail,
        # —— 辅助 ——
        "briefs_kinds": list(briefs.keys()),
        "outputs": outputs_summary,
        "docs_count": len(docs),
        "docs_by_type": _count_by(docs, "doc_type"),
        "docs_recent": docs[:10],
    }


async def _gather_stage_flow_status(done_kinds: set[str]) -> dict[str, Any]:
    """读 stage_flow 配置, 算每个 stage 的状态, 返回完整列表 + 当前活跃 stage。"""
    # 复用 stage_flow API 的 _read (内部 helper)
    try:
        from api.stage_flow import _read as _read_stage_flow
        stages, _is_default = await _read_stage_flow()
    except Exception:
        stages = []

    stages_with_status: list[dict] = []
    current_idx: int | None = None  # 第一个非 done 的 active stage

    for i, st in enumerate(stages):
        if not st.get("active"):
            stages_with_status.append({**st, "status": "locked"})
            continue
        # 该 stage 涉及的 kinds
        kinds: list[str] = []
        if st.get("kind"):
            kinds.append(st["kind"])
        for sk in (st.get("sub_kinds") or []):
            if sk.get("kind"):
                kinds.append(sk["kind"])
        # 推算 status
        if not kinds:
            status = "idle"
        elif all(k in done_kinds for k in kinds):
            status = "done"
        elif any(k in done_kinds for k in kinds):
            status = "partial"
        else:
            status = "idle"
        stages_with_status.append({
            "key": st.get("key"),
            "label": st.get("label"),
            "kinds": kinds,
            "active": True,
            "status": status,
        })
        if current_idx is None and status != "done":
            current_idx = len(stages_with_status) - 1

    # 当前阶段:第一个非 done 的 active;若全 done, 则取最后一个
    current_stage = None
    if stages_with_status:
        active_idx = current_idx if current_idx is not None else (len(stages_with_status) - 1)
        current_stage = stages_with_status[active_idx]

    return {
        "stages": stages_with_status,
        "current_stage": current_stage,
        "summary": _stage_summary(current_stage, stages_with_status),
    }


def _stage_summary(current: dict | None, all_stages: list[dict]) -> str:
    """生成一句人话的状态摘要, 给 LLM 一个简洁的入手描述。"""
    if not current:
        return "项目尚未配置阶段"
    if current.get("status") == "done":
        return f"全部阶段已完成(最后阶段:{current.get('label')})"
    done_count = sum(1 for s in all_stages if s.get("status") == "done")
    total_active = sum(1 for s in all_stages if s.get("active"))
    return f"当前停留在「{current.get('label')}」阶段(状态={current.get('status')}, 已完成 {done_count}/{total_active} 个阶段)"


def _gather_industry_pack_detail(industry: str | None) -> dict | None:
    """暴露完整 field_patches spec, 不只是字段名 — 给 LLM 用 ask 提示推断该问的方向。"""
    if not industry:
        return None
    pack = get_pack(industry)
    if not pack:
        return None
    return {
        "industry": pack.industry,
        "display_name": pack.display_name,
        "fields": pack.field_patches or {},          # 完整 dict {key: {label, ask, options?}}
        "pain_points": pack.pain_points or [],
        "must_visit_departments": pack.must_visit_departments or [],
        "typical_cases": [c.get("name") for c in (pack.cases or []) if isinstance(c, dict)],
    }


def _count_by(items: list[dict], key: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for it in items:
        v = it.get(key) or "未知"
        out[v] = out.get(v, 0) + 1
    return out


def _compute_hash(ctx: dict) -> str:
    """规范化上下文成 deterministic JSON 后哈希, 用于判断 inputs 是否真的变了。"""
    blob = json.dumps(ctx, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


# ────────────────────────────────────────────────────────────────────────
# LLM 调用
# ────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """你是 CRM 实施项目的资深咨询顾问 (MBB 风格, 10 年以上经验)。
你的任务: 综合「项目状态」+「行业包」两个核心维度, 给项目经理 (PM) 「下一步该做什么 + 当前关注的风险」。

输出格式严格按 JSON:
{
  "advice_md": "<200-400 字 markdown 主建议, 围绕「当前阶段 + 下一步动作 + 为什么」>",
  "next_steps": ["<动作 1>", "<动作 2>", "<动作 3, 3-5 条>"],
  "risks": ["<风险 1>", "<风险 2, 2-4 条>"]
}

核心 context 优先级:
- **project_status.current_stage**: 当前停在哪个阶段, 状态如何 — 建议必须紧贴这个阶段, 不要谈未来阶段
- **industry_pack.fields**: 行业专属字段(每个有 label + ask), 这是该行业必问 / 必关注的方向, 优先围绕这些给建议和风险
- **industry_pack.pain_points / typical_cases**: 行业典型痛点 / 标杆案例, 用于推断风险

辅助 context (作支撑, 不主导):
- briefs_kinds / outputs / docs_count: 已有材料情况 — 缺料时建议 PM 先去补

写作要求:
- 中文, 简洁实用, 避免空话套话
- 没有信息支撑的事不要瞎猜 — 实在没料就建议 PM 先去补什么资料
- 严格输出 JSON, 不要加 markdown 围栏 ```, 不要加任何解释"""


async def _generate_with_llm(ctx: dict) -> tuple[str, list[str], list[str]]:
    """调 LLM 生成建议。返回 (advice_md, next_steps, risks)。"""
    user_prompt = f"""【项目信息】
{json.dumps(ctx, ensure_ascii=False, indent=2)}

请基于以上信息, 给出当前阶段下一步建议 + 关键风险, 严格按要求 JSON 输出。"""

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
    content, _used = await model_router.chat(
        DEFAULT_MODEL, messages, max_tokens=2000, temperature=0.4, timeout=60.0,
    )
    # 解析 JSON
    parsed = _parse_json_loose(content)
    advice_md = str(parsed.get("advice_md") or "").strip()
    next_steps = _ensure_str_list(parsed.get("next_steps"))
    risks = _ensure_str_list(parsed.get("risks"))
    return advice_md, next_steps, risks


def _parse_json_loose(text: str) -> dict:
    """容忍 LLM 偶尔给 markdown 围栏。"""
    if not text:
        return {}
    s = text.strip()
    # 去掉可能的 ```json ... ``` 围栏
    if s.startswith("```"):
        nl = s.find("\n")
        if nl >= 0:
            s = s[nl + 1:]
        if s.endswith("```"):
            s = s[: -3]
        s = s.strip()
    try:
        return json.loads(s)
    except Exception:
        # 再试:截取第一个 { 到最后一个 } 之间
        l = s.find("{")
        r = s.rfind("}")
        if l >= 0 and r > l:
            try:
                return json.loads(s[l : r + 1])
            except Exception:
                return {}
        return {}


def _ensure_str_list(v: Any) -> list[str]:
    if isinstance(v, list):
        return [str(x).strip() for x in v if x is not None and str(x).strip()]
    if isinstance(v, str) and v.strip():
        return [v.strip()]
    return []
