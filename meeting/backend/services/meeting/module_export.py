"""会议模块导出核心服务 — 2026-07。

提供每个模块 (advice/requirements/process_flows/stakeholders) 的数据获取、
Markdown 生成、HTML 生成和 DOCX 转换。被 meeting.py API 端点调用。
"""

from __future__ import annotations

import io
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.meeting import Meeting, Requirement
from models.meeting_live_advice import MeetingLiveAdvice
from services.meeting.module_layouts import generate_html, LAYOUTS_BY_MODULE

logger = structlog.get_logger()

MODULES = ["advice", "requirements", "process_flows", "stakeholders"]

CAT_LABELS_MD = {
    "clarification": "需进一步明确",
    "ambiguity": "歧义点",
    "gap": "可能遗漏",
    "industry": "行业专属问题",
    "consensus": "已达成共识",
}

PRIORITY_LABELS_MD = {"high": "高优", "medium": "中优", "low": "低优"}

SIDE_LABELS_MD = {"internal": "我方", "customer": "客户", "vendor": "合作方", "unknown": "未知"}


def get_layouts_metadata(module: str) -> list[dict[str, str]]:
    """返回某模块的可用排版列表。"""
    return LAYOUTS_BY_MODULE.get(module, [])


# ── 数据获取 ────────────────────────────────────────────────────────────────


async def fetch_module_data(
    meeting_id: int,
    module: str,
    session: AsyncSession,
) -> dict:
    """从 DB 获取模块数据，返回字典给下游生成器使用。"""
    if module == "advice":
        return await _fetch_advice_data(meeting_id, session)
    elif module == "requirements":
        return await _fetch_requirements_data(meeting_id, session)
    elif module == "process_flows":
        return await _fetch_process_flows_data(meeting_id, session)
    elif module == "stakeholders":
        return await _fetch_stakeholders_data(meeting_id, session)
    raise ValueError(f"未知模块: {module}")


async def _fetch_advice_data(meeting_id: int, session: AsyncSession) -> dict:
    rows = (await session.execute(
        select(MeetingLiveAdvice).where(
            MeetingLiveAdvice.meeting_id == meeting_id,
            MeetingLiveAdvice.status == "open",
        ).order_by(MeetingLiveAdvice.source_ts.asc().nullslast(), MeetingLiveAdvice.id.asc())
    )).scalars().all()

    items = []
    for r in rows:
        items.append({
            "id": r.id,
            "category": r.category,
            "title": r.title or "",
            "question": r.question or "",
            "recommendation": r.recommendation or "",
            "source_quote": r.source_quote or "",
            "source_ts": r.source_ts,
            "priority": r.priority or "medium",
        })
    return {"items": items}


async def _fetch_requirements_data(meeting_id: int, session: AsyncSession) -> dict:
    rows = (await session.execute(
        select(Requirement).where(Requirement.meeting_id == meeting_id).order_by(Requirement.id.asc())
    )).scalars().all()

    items = []
    for r in rows:
        items.append({
            "id": r.id,
            "req_id": r.req_id,
            "module": r.module or "",
            "description": r.description or "",
            "priority": r.priority or "P2",
            "source": r.source or "",
            "speaker": r.speaker or "",
            "start_seconds": r.start_seconds,
            "end_seconds": r.end_seconds,
        })
    return {"items": items}


async def _fetch_process_flows_data(meeting_id: int, session: AsyncSession) -> dict:
    m = await session.get(Meeting, meeting_id)
    flows_data = m.process_flows if m else None
    flows = (flows_data or {}).get("flows", [])
    return {"flows": flows}


async def _fetch_stakeholders_data(meeting_id: int, session: AsyncSession) -> dict:
    m = await session.get(Meeting, meeting_id)
    smap = m.stakeholder_map if m else None
    if not smap:
        return {"stakeholders": [], "relations": []}
    return {
        "stakeholders": smap.get("stakeholders", []),
        "relations": smap.get("relations", []),
    }


# ── Markdown 生成 ───────────────────────────────────────────────────────────


def generate_markdown(module: str, layout_id: str, data: dict, meeting_title: str) -> str:
    """根据模块和排版 ID 生成 Markdown 字符串。"""
    if module == "advice":
        return _build_advice_md(data.get("items", []), layout_id, meeting_title)
    elif module == "requirements":
        return _build_requirements_md(data.get("items", []), layout_id, meeting_title)
    elif module == "process_flows":
        return _build_process_flows_md(data.get("flows", []), layout_id, meeting_title)
    elif module == "stakeholders":
        return _build_stakeholders_md(
            data.get("stakeholders", []), data.get("relations", []), layout_id, meeting_title,
        )
    raise ValueError(f"未知模块: {module}")


def _fmt_ts_md(seconds: float | None) -> str:
    if seconds is None:
        return ""
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m:02d}:{s:02d}"


# ── Advice Markdown ─────────────────────────────────────────────────────────

def _build_advice_md(items: list[dict], layout_id: str, meeting_title: str) -> str:
    header = f"# Co-pilot 调研建议 · {meeting_title}\n\n"
    if not items:
        return header + "暂无建议数据。"

    if layout_id == "compact_list":
        return _advice_md_compact_list(items, header)
    elif layout_id == "card_grid":
        return _advice_md_card_grid(items, header)
    elif layout_id == "question_focused":
        return _advice_md_question_focused(items, header)
    return _advice_md_compact_list(items, header)


def _advice_md_compact_list(items: list[dict], header: str) -> str:
    grouped: dict[str, list[dict]] = {}
    for a in items:
        cat = a.get("category", "clarification")
        grouped.setdefault(cat, []).append(a)

    lines = [header]
    cat_order = ["clarification", "ambiguity", "gap", "industry", "consensus"]
    for cat in cat_order:
        group = grouped.get(cat, [])
        if not group:
            continue
        label = CAT_LABELS_MD.get(cat, cat)
        lines.append(f"## {label} ({len(group)})\n")
        for a in group:
            ts = _fmt_ts_md(a.get("source_ts"))
            ts_str = f" `{ts}`" if ts else ""
            prio = PRIORITY_LABELS_MD.get(a.get("priority", "medium"), a.get("priority", "medium"))
            lines.append(f"- **[{prio}]** {a.get('title', '')}{ts_str}")
            if a.get("question"):
                lines.append(f"  - 💬 建议问法: {a.get('question')}")
            if a.get("recommendation"):
                lines.append(f"  - 💡 推荐方案: {a.get('recommendation')}")
        lines.append("")
    return "\n".join(lines)


def _advice_md_card_grid(items: list[dict], header: str) -> str:
    lines = [header, f"共 {len(items)} 条建议\n"]
    for a in items:
        cat = a.get("category", "clarification")
        cat_label = CAT_LABELS_MD.get(cat, cat)
        ts = _fmt_ts_md(a.get("source_ts"))
        ts_str = f" `{ts}`" if ts else ""
        lines.append(f"### {a.get('title', '')}{ts_str}")
        lines.append(f"- 类型: {cat_label}")
        if a.get("question"):
            lines.append(f"- 💬 问法: {a.get('question')}")
        if a.get("recommendation"):
            lines.append(f"- 💡 方案: {a.get('recommendation')}")
        if a.get("source_quote"):
            lines.append(f"- > {a.get('source_quote')}")
        lines.append("")
    return "\n".join(lines)


def _advice_md_question_focused(items: list[dict], header: str) -> str:
    grouped: dict[str, list[dict]] = {}
    for a in items:
        cat = a.get("category", "clarification")
        grouped.setdefault(cat, []).append(a)

    lines = [header]
    cat_order = ["clarification", "ambiguity", "gap", "industry", "consensus"]
    for cat in cat_order:
        group = grouped.get(cat, [])
        if not group:
            continue
        label = CAT_LABELS_MD.get(cat, cat)
        lines.append(f"## {label}\n")
        for a in group:
            question = a.get("question") or a.get("title", "")
            lines.append(f"### 💬 {question}")
            lines.append(f"**{a.get('title', '')}**")
            if a.get("recommendation"):
                lines.append(f"\n{a.get('recommendation')}")
            ts = _fmt_ts_md(a.get("source_ts"))
            if ts:
                lines.append(f"\n`{ts}`")
            lines.append("")
    return "\n".join(lines)


# ── Requirements Markdown ───────────────────────────────────────────────────

def _build_requirements_md(items: list[dict], layout_id: str, meeting_title: str) -> str:
    header = f"# 需求清单 · {meeting_title}\n\n"
    if not items:
        return header + "暂无需求数据。"

    if layout_id == "standard_table":
        return _req_md_table(items, header)
    elif layout_id == "grouped_by_priority":
        return _req_md_grouped_by_priority(items, header)
    elif layout_id == "grouped_by_module":
        return _req_md_grouped_by_module(items, header)
    return _req_md_table(items, header)


def _req_md_table(items: list[dict], header: str) -> str:
    lines = [header, f"共 {len(items)} 条需求\n"]
    lines.append("| 编号 | 模块 | 需求描述 | 优先级 | 时间 | 提出人 |")
    lines.append("|------|------|----------|--------|------|--------|")
    for r in items:
        req_id = r.get("req_id", "")
        module = r.get("module", "")
        desc = (r.get("description") or "").replace("\n", " ").replace("|", "\\|")
        priority = r.get("priority", "P2")
        start = r.get("start_seconds")
        end = r.get("end_seconds")
        time_str = _fmt_ts_md(start) + (f" - {_fmt_ts_md(end)}" if end else "")
        speaker = r.get("speaker", "")
        lines.append(f"| {req_id} | {module} | {desc} | {priority} | {time_str} | {speaker} |")
    return "\n".join(lines)


def _req_md_grouped_by_priority(items: list[dict], header: str) -> str:
    grouped: dict[str, list[dict]] = {"P0": [], "P1": [], "P2": [], "P3": []}
    for r in items:
        p = r.get("priority", "P2")
        grouped.setdefault(p, []).append(r)

    lines = [header, f"共 {len(items)} 条需求\n"]
    for p in ["P0", "P1", "P2", "P3"]:
        group = grouped.get(p, [])
        if not group:
            continue
        lines.append(f"## {p} · {len(group)} 条\n")
        lines.append("| 编号 | 模块 | 需求描述 | 时间 | 提出人 |")
        lines.append("|------|------|----------|------|--------|")
        for r in group:
            req_id = r.get("req_id", "")
            module = r.get("module", "")
            desc = (r.get("description") or "").replace("\n", " ").replace("|", "\\|")
            start = r.get("start_seconds")
            end = r.get("end_seconds")
            time_str = _fmt_ts_md(start) + (f" - {_fmt_ts_md(end)}" if end else "")
            speaker = r.get("speaker", "")
            lines.append(f"| {req_id} | {module} | {desc} | {time_str} | {speaker} |")
        lines.append("")
    return "\n".join(lines)


def _req_md_grouped_by_module(items: list[dict], header: str) -> str:
    grouped: dict[str, list[dict]] = {}
    for r in items:
        m = r.get("module") or "未分类"
        grouped.setdefault(m, []).append(r)

    lines = [header, f"共 {len(items)} 条需求，{len(grouped)} 个模块\n"]
    for mod in sorted(grouped.keys()):
        group = grouped[mod]
        lines.append(f"## {mod} ({len(group)})\n")
        lines.append("| 编号 | 需求描述 | 优先级 | 时间 | 提出人 |")
        lines.append("|------|----------|--------|------|--------|")
        for r in group:
            req_id = r.get("req_id", "")
            desc = (r.get("description") or "").replace("\n", " ").replace("|", "\\|")
            priority = r.get("priority", "P2")
            start = r.get("start_seconds")
            end = r.get("end_seconds")
            time_str = _fmt_ts_md(start) + (f" - {_fmt_ts_md(end)}" if end else "")
            speaker = r.get("speaker", "")
            lines.append(f"| {req_id} | {desc} | {priority} | {time_str} | {speaker} |")
        lines.append("")
    return "\n".join(lines)


# ── Process Flows Markdown ──────────────────────────────────────────────────

def _build_process_flows_md(flows: list[dict], layout_id: str, meeting_title: str) -> str:
    header = f"# 业务流程 · {meeting_title}\n\n"
    if not flows:
        return header + "暂无流程数据。"

    if layout_id == "compact_summary":
        return _flows_md_compact(flows, header)
    elif layout_id == "grouped_by_category":
        return _flows_md_grouped(flows, header)
    else:
        return _flows_md_full(flows, header)


def _flows_md_full(flows: list[dict], header: str) -> str:
    lines = [header, f"共 {len(flows)} 个流程\n"]
    for i, f in enumerate(flows, 1):
        lines.append(f"## {i}. {f.get('title', '')}")
        lines.append(f"- ID: `{f.get('flow_id', '')}`")
        lines.append(f"- 类别: {f.get('category', '')}")
        if f.get("summary"):
            lines.append(f"- 摘要: {f.get('summary')}")
        if f.get("description"):
            lines.append(f"\n{f.get('description')}\n")
        if f.get("source"):
            speaker = f" — {f.get('speaker')}" if f.get("speaker") else ""
            lines.append(f"> {f.get('source')}{speaker}\n")
        if f.get("mermaid"):
            lines.append("```mermaid")
            lines.append(f.get("mermaid", ""))
            lines.append("```\n")
    return "\n".join(lines)


def _flows_md_grouped(flows: list[dict], header: str) -> str:
    grouped: dict[str, list[dict]] = {}
    for f in flows:
        cat = f.get("category", "业务流程")
        grouped.setdefault(cat, []).append(f)

    lines = [header, f"共 {len(flows)} 个流程\n"]
    for cat in ["业务流程", "工作流", "审批流", "操作步骤"]:
        group = grouped.get(cat, [])
        if not group:
            continue
        lines.append(f"## {cat} ({len(group)})\n")
        for f in group:
            lines.append(f"### {f.get('title', '')}")
            if f.get("summary"):
                lines.append(f"{f.get('summary')}")
            if f.get("mermaid"):
                lines.append("\n```mermaid")
                lines.append(f.get("mermaid", ""))
                lines.append("```")
            lines.append("")
    return "\n".join(lines)


def _flows_md_compact(flows: list[dict], header: str) -> str:
    lines = [header, f"共 {len(flows)} 个流程\n"]
    for f in flows:
        cat = f.get("category", "业务流程")
        lines.append(f"- **[{cat}]** {f.get('title', '')}")
        if f.get("summary"):
            lines.append(f"  - {f.get('summary')}")
    return "\n".join(lines)


# ── Stakeholders Markdown ───────────────────────────────────────────────────

def _build_stakeholders_md(
    stakeholders: list[dict], relations: list[dict], layout_id: str, meeting_title: str,
) -> str:
    header = f"# 干系人 · {meeting_title}\n\n"
    if not stakeholders:
        return header + "暂无干系人数据。"

    if layout_id == "relation_focused":
        return _stakeholders_md_relation_focused(stakeholders, relations, header)
    elif layout_id == "grouped_by_side":
        return _stakeholders_md_grouped(stakeholders, relations, header)
    else:
        return _stakeholders_md_cards(stakeholders, relations, header)


def _stakeholders_md_cards(stakeholders: list[dict], relations: list[dict], header: str) -> str:
    lines = [header, f"共 {len(stakeholders)} 个干系人\n"]
    lines.append("## 干系人列表\n")
    lines.append("| 姓名 | 角色 | 立场 | 组织 | 关键观点 |")
    lines.append("|------|------|------|------|----------|")
    for s in stakeholders:
        name = s.get("name", "")
        role = s.get("role", "")
        side = SIDE_LABELS_MD.get(s.get("side", "unknown"), s.get("side", "unknown"))
        org = s.get("organization", "")
        kps = "；".join(s.get("key_points", [])[:3])
        lines.append(f"| {name} | {role} | {side} | {org} | {kps} |")

    if relations:
        lines.append("\n## 协作关系\n")
        lines.append("| 来源 | 目标 | 关系类型 | 描述 |")
        lines.append("|------|------|----------|------|")
        for r in relations:
            lines.append(f"| {r.get('from', '')} | {r.get('to', '')} | {r.get('type', '')} | {r.get('description', '')} |")
    return "\n".join(lines)


def _stakeholders_md_grouped(stakeholders: list[dict], relations: list[dict], header: str) -> str:
    grouped: dict[str, list[dict]] = {}
    for s in stakeholders:
        side = s.get("side", "unknown")
        grouped.setdefault(side, []).append(s)

    lines = [header, f"共 {len(stakeholders)} 个干系人\n"]
    for side in ["internal", "customer", "vendor", "unknown"]:
        group = grouped.get(side, [])
        if not group:
            continue
        label = SIDE_LABELS_MD.get(side, side)
        lines.append(f"## {label} ({len(group)})\n")
        for s in group:
            lines.append(f"### {s.get('name', '')}")
            if s.get("role"):
                lines.append(f"- 角色: {s.get('role')}")
            if s.get("organization"):
                lines.append(f"- 组织: {s.get('organization')}")
            aliases = s.get("aliases", [])
            if aliases:
                lines.append(f"- 别名: {'、'.join(aliases)}")
            kps = s.get("key_points", [])
            if kps:
                lines.append("- 关键观点:")
                for kp in kps:
                    lines.append(f"  - {kp}")
            lines.append("")

    if relations:
        lines.append("## 协作关系\n")
        for r in relations:
            lines.append(f"- {r.get('from', '')} → {r.get('to', '')} ({r.get('type', '') or '未指定'})")
    return "\n".join(lines)


def _stakeholders_md_relation_focused(stakeholders: list[dict], relations: list[dict], header: str) -> str:
    lines = [header, f"共 {len(stakeholders)} 个干系人 · {len(relations)} 条关系\n"]

    if relations:
        lines.append("## 协作关系\n")
        lines.append("| 来源 | 目标 | 关系类型 | 描述 |")
        lines.append("|------|------|----------|------|")
        for r in relations:
            lines.append(f"| {r.get('from', '')} | {r.get('to', '')} | {r.get('type', '')} | {r.get('description', '')} |")
        lines.append("")

    lines.append("## 干系人列表\n")
    lines.append("| 姓名 | 角色 | 立场 | 组织 |")
    lines.append("|------|------|------|------|")
    for s in stakeholders:
        name = s.get("name", "")
        role = s.get("role", "")
        side = SIDE_LABELS_MD.get(s.get("side", "unknown"), s.get("side", "unknown"))
        org = s.get("organization", "")
        lines.append(f"| {name} | {role} | {side} | {org} |")
    return "\n".join(lines)


# ── DOCX 生成（委托给 KB 系统 _build_docx）───────────────────────────────────


def generate_docx(module: str, layout_id: str, data: dict, meeting_title: str) -> bytes:
    """生成 MD → 转换为 DOCX。复用 KB 系统 `_build_docx`。"""
    md = generate_markdown(module, layout_id, data, meeting_title)
    # 跨包复用:从 backend/services/output_service 引入 _build_docx
    # 该函数位于 knowledge-base/backend/services/output_service.py
    import sys
    import os as _os
    # 确保 backend 在 sys.path 中（Docker 环境下 /app 已在 path，本地开发需补）
    _kb_backend = _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))))), "")
    if _kb_backend not in sys.path:
        sys.path.insert(0, _kb_backend)
    from services.output_service import _build_docx
    return _build_docx(f"{meeting_title}", md)
