"""现场调研实时副驾(2026-06-22)。

基于截至目前的转写 + 项目(行业/客户/模块)+ LTC 覆盖基准 + 已有建议,
产出 4 类调研建议(clarification / ambiguity / gap / industry)。

增量去重 + 澄清闭环:每轮把 open 建议(带 DB id)喂回 LLM,
LLM 只产【新增】+ 返回 resolved_ids(已被后续对话澄清的旧建议)。
独立于录音/纪要主链路,失败不影响录音。
"""
from __future__ import annotations

import re
import structlog
from sqlalchemy import select

from models import async_session_maker
from models.meeting import Meeting
from models.meeting_live_advice import MeetingLiveAdvice
from models.project import Project
from services._time import utcnow_naive
from services.llm_json import loads_lenient
from services.model_router import model_router
from prompts.meeting import LIVE_ADVICE_SYSTEM, LIVE_ADVICE_USER

logger = structlog.get_logger()

_CATEGORIES = {"clarification", "ambiguity", "gap", "industry"}
_PRIORITIES = {"high", "medium", "low"}
_PARSE_FAIL = object()
_MIN_TRANSCRIPT_CHARS = 40   # 转写太短没意义
_CTX_LIMIT = 16000           # 喂给 LLM 的转写上限(超了取头 4k + 尾)


def _bound_transcript(t: str) -> str:
    """长会控上下文:超限时保留开头(早段覆盖,gap 判断需要)+ 近段全文。"""
    if len(t) <= _CTX_LIMIT:
        return t
    return t[:4000] + "\n…(中间省略)…\n" + t[-(_CTX_LIMIT - 4000):]


def _coverage_baseline(project: Project | None) -> str:
    """gap 检测基准:LTC 标准模块(按 project.modules 裁剪)的节点 + 常见痛点。"""
    from services.agentic.research.ltc_dictionary import (
        LTC_MAIN_MODULES, get_module, find_module_by_alias,
    )
    mods, seen = [], set()
    for raw in ((project.modules if project else None) or []):
        lm = get_module(str(raw)) or find_module_by_alias(str(raw))
        if lm and lm.key not in seen:
            mods.append(lm)
            seen.add(lm.key)
    if not mods:
        mods = LTC_MAIN_MODULES  # 项目没勾模块 → 默认 8 个主流程
    lines = []
    for lm in mods:
        pains = lm.default_option_pools.get("common_pain_points", [])
        line = f"- {lm.label}({lm.key}):{lm.purpose}\n  标准节点:{'、'.join(lm.standard_nodes)}"
        if pains:
            line += f"\n  常见痛点:{'、'.join(pains)}"
        lines.append(line)
    return "\n".join(lines)


def _project_context(project: Project | None) -> str:
    if not project:
        return "(本会议未关联项目,行业/客户上下文缺失——行业类建议请保守)"
    parts = [f"客户:{project.customer or '(未填)'}", f"行业:{project.industry or '(未填)'}"]
    if project.modules:
        parts.append(f"实施模块:{'、'.join(str(m) for m in project.modules)}")
    if project.description:
        parts.append(f"背景:{project.description[:500]}")
    if project.customer_profile:
        parts.append(f"客户画像:{project.customer_profile[:500]}")
    return "\n".join(parts)


def _ts_to_seconds(s) -> float | None:
    """转写时间戳 → 秒。兼容 [MM:SS](录音)和 HH:MM:SS(上传的妙记类文本)。"""
    if not s:
        return None
    m = re.match(r"\s*(\d+):(\d+)(?::(\d+))?", str(s))
    if not m:
        return None
    if m.group(3) is not None:  # HH:MM:SS
        return float(m.group(1)) * 3600 + float(m.group(2)) * 60 + float(m.group(3))
    return float(m.group(1)) * 60 + float(m.group(2))  # MM:SS


def _bigrams(s: str) -> set:
    s = re.sub(r"[\s\W_]+", "", s or "")
    return {s[i:i + 2] for i in range(len(s) - 1)} if len(s) >= 2 else ({s} if s else set())


def _too_similar(title: str, others: list[str], thresh: float = 0.55) -> bool:
    """字符 bigram Jaccard 近似去重——挡住措辞不同的近似重复建议(频繁触发时尤其需要)。"""
    tb = _bigrams(title)
    if not tb:
        return False
    for o in others:
        ob = _bigrams(o)
        if ob and len(tb & ob) / len(tb | ob) >= thresh:
            return True
    return False


def _norm(s: str) -> str:
    """归一化:去空白/标点/下划线 + 小写,用于 source_quote 与转写做出处比对。"""
    return re.sub(r"[\s\W_]+", "", s or "").lower()


def _quote_grounded(quote: str, norm_transcript: str) -> bool:
    """source_quote 按 prompt 约定应是转写原话。归一化后:整段命中、或任一 8 字连续片段
    命中,即视为有据(容忍 ASR 轻微差异);完全对不上 → 判为模型编造的出处 → 丢弃该建议。"""
    q = _norm(quote)
    if len(q) < 6:
        return True  # 引用过短(或本就没引用)不据此判
    if q in norm_transcript:
        return True
    for i in range(0, len(q) - 8 + 1, 4):
        if q[i:i + 8] in norm_transcript:
            return True
    return False


_CAT_LABEL = {"clarification": "需明确", "ambiguity": "歧义", "gap": "遗漏", "industry": "行业"}


def _serialize(items: list[MeetingLiveAdvice]) -> list[dict]:
    return [{
        "id": a.id, "category": a.category, "category_label": _CAT_LABEL.get(a.category, a.category),
        "title": a.title, "recommendation": a.recommendation, "question": a.question, "rationale": a.rationale,
        "source_quote": a.source_quote, "source_ts": a.source_ts,
        "ltc_module": a.ltc_module, "priority": a.priority, "status": a.status,
    } for a in items]


async def _open_advice(session, meeting_id: int) -> list[MeetingLiveAdvice]:
    rows = (await session.execute(
        select(MeetingLiveAdvice)
        .where(MeetingLiveAdvice.meeting_id == meeting_id, MeetingLiveAdvice.status == "open")
        .order_by(MeetingLiveAdvice.id)
    )).scalars().all()
    return list(rows)


async def get_live_advice(meeting_id: int, include_resolved: bool = False) -> dict:
    """只读:返回当前 open 建议,不跑 LLM(前端轮询用)。
    include_resolved=True 时附带 resolved_advice(已完成成果清单,详情页复盘用)。"""
    async with async_session_maker() as session:
        items = await _open_advice(session, meeting_id)
        out = {"advice": _serialize(items), "count": len(items)}
        if include_resolved:
            rows = (await session.execute(
                select(MeetingLiveAdvice)
                .where(MeetingLiveAdvice.meeting_id == meeting_id, MeetingLiveAdvice.status == "resolved")
                .order_by(MeetingLiveAdvice.source_ts, MeetingLiveAdvice.id)  # PG 默认 NULLS LAST
            )).scalars().all()
            out["resolved_advice"] = _serialize(list(rows))
    return out


async def _set_status(meeting_id: int, advice_id: int, status: str) -> bool:
    async with async_session_maker() as session:
        row = await session.get(MeetingLiveAdvice, advice_id)
        if not row or row.meeting_id != meeting_id:
            return False
        row.status = status
        row.resolved_by_user = True   # 人工判定(✓完成/✕删除),区别于 LLM 自动 resolved
        row.resolved_at = utcnow_naive()
        await session.commit()
    return True


async def dismiss_advice(meeting_id: int, advice_id: int) -> bool:
    """顾问手动删除(忽略)一条建议。"""
    return await _set_status(meeting_id, advice_id, "dismissed")


async def resolve_advice(meeting_id: int, advice_id: int) -> bool:
    """顾问手动标记一条建议为已完成(成果);与 LLM 自动 resolved 同状态。"""
    return await _set_status(meeting_id, advice_id, "resolved")


async def generate_live_advice(meeting_id: int) -> dict:
    """跑一轮分析:出新增建议 + 标记已澄清,返回当前所有 open 建议。"""
    async with async_session_maker() as session:
        meeting = await session.get(Meeting, meeting_id)
        if not meeting:
            return {"advice": [], "count": 0, "error": "meeting_not_found"}
        transcript = (meeting.raw_transcript or "").strip()
        project = await session.get(Project, meeting.project_id) if meeting.project_id else None
        existing = await _open_advice(session, meeting_id)
        max_run = max((a.run_seq for a in existing), default=0)

    if len(transcript) < _MIN_TRANSCRIPT_CHARS:
        return {"advice": _serialize(existing), "count": len(existing), "note": "transcript_too_short"}

    existing_brief = "\n".join(f"[{a.id}] ({a.category}) {a.title}" for a in existing) or "(暂无)"

    messages = [
        {"role": "system", "content": LIVE_ADVICE_SYSTEM},
        {"role": "user", "content": LIVE_ADVICE_USER.format(
            project_context=_project_context(project),
            coverage_baseline=_coverage_baseline(project),
            existing_advice=existing_brief,
            transcript=_bound_transcript(transcript),
        )},
    ]
    try:
        content, model = await model_router.chat_with_routing(
            task="meeting_live_advice", messages=messages,
            temperature=0.3, max_tokens=8000,  # 方案要列出具体规则,输出较长
            response_format={"type": "json_object"},
        )
    except Exception as e:
        logger.exception("live_advice_llm_failed", meeting_id=meeting_id, error=str(e)[:200])
        return {"advice": _serialize(existing), "count": len(existing), "error": "llm_failed"}

    parsed = loads_lenient(content, _PARSE_FAIL)
    if parsed is _PARSE_FAIL or not isinstance(parsed, dict):
        logger.warning("live_advice_parse_failed", meeting_id=meeting_id, raw=(content or "")[:200])
        return {"advice": _serialize(existing), "count": len(existing), "error": "parse_failed"}

    new_items = parsed.get("new_advice") or []
    resolved_ids = parsed.get("resolved_ids") or []
    run_seq = max_run + 1
    # 按 category 收已有标题,新增时做精确 + 近似去重
    existing_by_cat: dict[str, list[str]] = {}
    for a in existing:
        existing_by_cat.setdefault(a.category, []).append((a.title or "").strip())
    valid_ids = {a.id for a in existing}

    async with async_session_maker() as session:
        # 标记 resolved
        for rid in resolved_ids:
            try:
                rid = int(rid)
            except (TypeError, ValueError):
                continue
            if rid in valid_ids:
                row = await session.get(MeetingLiveAdvice, rid)
                if row and row.status == "open":
                    row.status = "resolved"
                    row.resolved_at = utcnow_naive()
        # 插入新增(去重:同 category+title 跳过;反幻觉:声称的原话出处查无此句则丢弃)
        added = 0
        dropped_ungrounded = 0
        norm_transcript = _norm(transcript)
        for raw in new_items:
            if not isinstance(raw, dict):
                continue
            cat = (raw.get("category") or "").strip()
            title = (raw.get("title") or "").strip()
            if cat not in _CATEGORIES or not title:
                continue
            # 反幻觉:声称了 source_quote 出处,却在转写里查无此句 → 判为编造,丢弃整条
            quote = (raw.get("source_quote") or "").strip()
            if quote and not _quote_grounded(quote, norm_transcript):
                dropped_ungrounded += 1
                continue
            cat_titles = existing_by_cat.setdefault(cat, [])
            if title in cat_titles or _too_similar(title, cat_titles):
                continue
            cat_titles.append(title)
            prio = (raw.get("priority") or "medium").strip().lower()
            session.add(MeetingLiveAdvice(
                meeting_id=meeting_id, category=cat, title=title[:2000],
                recommendation=(raw.get("recommendation") or "").strip() or None,
                question=(raw.get("question") or "").strip() or None,
                rationale=(raw.get("rationale") or "").strip() or None,
                source_quote=quote or None,
                source_ts=_ts_to_seconds(raw.get("source_ts")),
                ltc_module=(raw.get("ltc_module") or "").strip()[:40] or None,
                priority=prio if prio in _PRIORITIES else "medium",
                status="open", run_seq=run_seq,
            ))
            added += 1
        await session.commit()
        items = await _open_advice(session, meeting_id)

    logger.info("live_advice_done", meeting_id=meeting_id, model=model,
                added=added, dropped_ungrounded=dropped_ungrounded,
                resolved=len(resolved_ids), open_total=len(items), run_seq=run_seq)
    return {"advice": _serialize(items), "count": len(items), "model": model,
            "added": added, "dropped_ungrounded": dropped_ungrounded, "resolved": len(resolved_ids)}
