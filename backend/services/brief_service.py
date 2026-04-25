"""Brief schemas + LLM-driven auto-extraction.

按 output_kind 定义需要的字段；用户进入"开始生成"时若 brief 缺失，前端会调
/api/briefs/{kind}/extract 让 LLM 基于项目元数据 + 关联文档摘要 + KB 检索
一次性把字段抽出（每字段含 confidence 与 sources）作为草稿。

不做 per-skill schema —— 直接按交付物种类划分 schema 更直观，少一个迁移。
"""
import json
import structlog
from sqlalchemy import select
from models import async_session_maker
from models.project import Project
from models.document import Document
from models.chunk import Chunk

logger = structlog.get_logger()


# 字段定义：key/label/hint/required/group/type
# type: text | list | date
BRIEF_SCHEMAS: dict[str, list[dict]] = {
    "kickoff_pptx": [
        # 项目背景
        {"key": "business_context",   "label": "客户业务背景",      "hint": "客户主营、规模、组织、当前业务挑战", "group": "项目背景", "type": "text", "required": True},
        {"key": "current_state",      "label": "现状与痛点",         "hint": "现有系统、流程问题、已知缺口（事实型）",     "group": "项目背景", "type": "text", "required": True},
        {"key": "industry_landscape", "label": "行业判断",           "hint": "行业典型规模 / 数字化成熟度 / 同行参照",       "group": "项目背景", "type": "text", "required": False},
        # 范围
        {"key": "scope_in",           "label": "范围内（In-scope）", "hint": "本期实施覆盖的模块、流程、用户群、数据域",     "group": "范围与目标", "type": "list", "required": True},
        {"key": "scope_out",          "label": "范围外（Out-of-scope）", "hint": "明确排除的模块/系统/能力",                 "group": "范围与目标", "type": "list", "required": False},
        {"key": "smart_goals",        "label": "SMART 目标 3 条",    "hint": "每条含可量化指标（如转化率提升 X%、周期缩短 X 天）","group": "范围与目标", "type": "list", "required": True},
        # 治理
        {"key": "stakeholders",       "label": "干系人",             "hint": "甲方决策人 / 业务负责人 / 乙方 PM / 联合团队（角色+态度）", "group": "团队与治理", "type": "list", "required": True},
        {"key": "raci_notes",         "label": "RACI 关键约定",      "hint": "需求评审、变更控制、上线决策由谁拍板",         "group": "团队与治理", "type": "text", "required": False},
        # 计划
        {"key": "phase_plan",         "label": "阶段计划",           "hint": "Phase 1/2/… 的边界、时间窗、交付物（双周粒度）", "group": "计划与里程碑", "type": "list", "required": True},
        {"key": "key_milestones",     "label": "关键里程碑",         "hint": "UAT / 上线 / 验收日期",                          "group": "计划与里程碑", "type": "list", "required": True},
        {"key": "kickoff_date",       "label": "启动日期",           "hint": "若已确定，写明日期；否则 [待确认]",              "group": "计划与里程碑", "type": "date", "required": False},
        # 风险
        {"key": "key_risks",          "label": "Top 风险与应对",     "hint": "5 条以内，每条 风险/影响/可能性/应对/Owner",     "group": "风险", "type": "list", "required": True},
        # 资源
        {"key": "budget_resource",    "label": "预算与人天",         "hint": "项目预算区间、关键角色人天分布；不清楚写 [待确认]","group": "资源", "type": "text", "required": False},
        {"key": "next_steps",         "label": "本周/下周 Next Step","hint": "具体到 Owner 与 deadline 的 Action Items",       "group": "Next Step", "type": "list", "required": True},
    ],
    "insight": [
        # 项目快照
        {"key": "exec_summary",       "label": "执行摘要要点",       "hint": "3–5 条 bullet：当前态势 + 1 大机会 + 1 大风险",  "group": "执行摘要", "type": "list", "required": True},
        {"key": "project_overview",   "label": "项目概览（量化）",   "hint": "用户数 / 模块数 / 预算 / 时间窗",                "group": "项目概览", "type": "text", "required": True},
        # 干系人
        {"key": "stakeholder_map",    "label": "干系人画像",         "hint": "角色/决策权重/态度（积极/观望/阻力）",          "group": "干系人", "type": "list", "required": True},
        # 决策
        {"key": "decisions_made",     "label": "已做出的关键决策",   "hint": "决策内容 + 背景 + 影响",                          "group": "关键决策", "type": "list", "required": False},
        {"key": "decisions_pending",  "label": "待决策事项",         "hint": "选项 A/B + Owner + 截止时间",                     "group": "关键决策", "type": "list", "required": True},
        # 风险与依赖
        {"key": "risks",              "label": "Top 5–8 风险",       "hint": "风险 / 影响 / 可能性 / 应对 / Owner",            "group": "风险与依赖", "type": "list", "required": True},
        {"key": "dependencies",       "label": "关键依赖与里程碑",   "hint": "阻塞项与时间线",                                  "group": "风险与依赖", "type": "list", "required": True},
        # 行业最佳实践
        {"key": "best_practices",     "label": "可借鉴 / 应规避",    "hint": "2–3 条同行业可借鉴 + 1–2 条反例（标出处）",       "group": "行业最佳实践", "type": "list", "required": False},
        # 行动
        {"key": "next_actions",       "label": "下一步建议",         "hint": "5–8 条；区分 Quick Win / Strategic；含 Owner+deadline+预期产出", "group": "行动", "type": "list", "required": True},
    ],
}


def get_schema(output_kind: str) -> list[dict]:
    return BRIEF_SCHEMAS.get(output_kind, [])


def empty_brief(output_kind: str) -> dict:
    """根据 schema 返回空骨架。"""
    schema = get_schema(output_kind)
    return {f["key"]: {"value": None, "confidence": None, "sources": []} for f in schema}


def merge_extract_with_user_edits(existing: dict, draft: dict) -> dict:
    """合并：用户编辑过的字段（edited_at 存在）保留；其余用新草稿覆盖。"""
    merged: dict = {}
    keys = set(existing or {}) | set(draft or {})
    for k in keys:
        old = (existing or {}).get(k) or {}
        new = (draft or {}).get(k) or {}
        if old.get("edited_at"):
            merged[k] = old
        else:
            merged[k] = new
    return merged


# ── LLM 抽取 ────────────────────────────────────────────────────────────────

EXTRACT_SYSTEM = """你是一名 MBB 风格的资深咨询顾问助理，正在为一份 CRM 实施项目交付物起草 Brief。
你只负责"抽取与初填"，不负责创作；遇到没有依据的字段一律给 null + low confidence。

【输出 — 严格 JSON】
- 必须输出可被 JSON.parse 解析的对象，不要 ```json 围栏，不要任何前后语句
- 顶层结构：{ "fields": { "<field_key>": { "value": ... | null, "confidence": "high"|"medium"|"low"|null, "sources": [{"type":"...","ref":"...","snippet":"..."}] } } }
- value 类型按 schema：text → 字符串；list → 字符串数组；date → "YYYY-MM-DD"；信息缺失 → null
- confidence：
  - high：素材里有明确依据（直接引文/数字）
  - medium：可由素材合理推断
  - low：靠行业常识 + 客户画像泛泛推断
  - null：没有依据，value 必须为 null
- sources[] 至多 3 条；type ∈ {"document","kb_chunk","metadata","industry"}；ref 写文档名/切片 ID/字段名；snippet 不超过 80 字
- 不得编造来源；如果只是行业常识，sources=[{"type":"industry","ref":"行业常识","snippet":"..."}]，confidence=low

【风格】
- list 类字段每条 ≤ 60 字、可执行、避免黑话（赋能/抓手/链路/生态/全方位）
- text 类字段 100–250 字
- 数据型字段尽量给区间/数字；不知道写 null

【关键】不要省略 schema 里任何 key，全部输出（即使 value 为 null）。
"""


def _format_schema_for_prompt(schema: list[dict]) -> str:
    lines = []
    for f in schema:
        kind = f.get("type", "text")
        req = "必填" if f.get("required") else "选填"
        hint = f.get("hint") or ""
        lines.append(f'- {f["key"]} ({kind}, {req}) — {f["label"]}：{hint}')
    return "\n".join(lines)


async def _gather_extract_context(project_id: str, kind: str) -> dict:
    """拉项目元数据 + 关联文档摘要 + 项目相关 KB chunks（轻量）。"""
    async with async_session_maker() as s:
        proj = await s.get(Project, project_id) if project_id else None
        doc_rows = []
        chunks_text = ""
        if proj:
            doc_rows = (await s.execute(
                select(Document.id, Document.filename, Document.summary, Document.doc_type)
                .where(Document.project_id == proj.id)
                .limit(30)
            )).all()
            doc_ids = [r.id for r in doc_rows]
            if doc_ids:
                chunk_rows = (await s.execute(
                    select(Chunk.content, Chunk.source_section, Document.filename)
                    .join(Document, Document.id == Chunk.document_id)
                    .where(Chunk.document_id.in_(doc_ids))
                    .where(Chunk.review_status != "rejected")
                    .order_by(Chunk.citation_count.desc())
                    .limit(30)
                )).all()
                chunks_text = "\n\n".join(
                    f"[{r.filename or '未知文档'}{(' · ' + r.source_section) if r.source_section else ''}]\n{(r.content or '')[:400]}"
                    for r in chunk_rows
                )

    docs_summary = "\n".join(
        f"- {r.filename}（{r.doc_type or '未分类'}）: {(r.summary or '')[:200]}"
        for r in doc_rows
    ) if doc_rows else "（无关联文档）"

    return {
        "project": proj,
        "docs_summary": docs_summary,
        "chunks_text": chunks_text,
    }


def _parse_brief_response(raw: str, schema: list[dict]) -> dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        nl = text.find("\n")
        if nl >= 0:
            text = text[nl + 1:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    if not text.startswith("{"):
        i = text.find("{")
        j = text.rfind("}")
        if i >= 0 and j > i:
            text = text[i:j+1]
    try:
        parsed = json.loads(text)
    except Exception as e:
        logger.warning("brief_extract_json_parse_failed", error=str(e)[:120], head=text[:200])
        return {}
    fields_raw = parsed.get("fields") if isinstance(parsed, dict) else None
    if not isinstance(fields_raw, dict):
        return {}
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    out: dict = {}
    for f in schema:
        k = f["key"]
        v = fields_raw.get(k) or {}
        out[k] = {
            "value": v.get("value"),
            "confidence": v.get("confidence") if v.get("confidence") in {"high", "medium", "low"} else None,
            "sources": v.get("sources") if isinstance(v.get("sources"), list) else [],
            "auto_filled_at": now_iso,
        }
    return out


async def stream_extract_brief_draft(project_id: str, output_kind: str, model: str | None = None):
    """异步生成器：边干边吐进度事件。

    事件 schema：
    - {"type":"stage_start","id":"...","label":"..."}
    - {"type":"stage_done","id":"...","detail":"..."}
    - {"type":"done","fields":{...}}
    - {"type":"error","message":"..."}
    """
    schema = get_schema(output_kind)
    if not schema:
        yield {"type": "done", "fields": {}}
        return

    # ── 1. 项目元数据 ─────────────────────────────────────
    yield {"type": "stage_start", "id": "metadata", "label": "拉取项目元数据"}
    try:
        async with async_session_maker() as s:
            proj = await s.get(Project, project_id) if project_id else None
        yield {"type": "stage_done", "id": "metadata",
               "detail": (proj.name if proj else "无项目")}
    except Exception as e:
        yield {"type": "error", "message": f"读取项目失败：{e}"}
        return

    # ── 2. 关联文档摘要 ──────────────────────────────────
    yield {"type": "stage_start", "id": "documents", "label": "读取关联文档摘要"}
    doc_rows = []
    try:
        if proj:
            async with async_session_maker() as s:
                doc_rows = (await s.execute(
                    select(Document.id, Document.filename, Document.summary, Document.doc_type)
                    .where(Document.project_id == proj.id)
                    .limit(30)
                )).all()
        yield {"type": "stage_done", "id": "documents",
               "detail": f"{len(doc_rows)} 份文档"}
    except Exception as e:
        yield {"type": "error", "message": f"读取文档失败：{e}"}
        return

    # ── 3. KB 相关切片 ───────────────────────────────────
    yield {"type": "stage_start", "id": "chunks", "label": "检索知识库相关切片"}
    chunks_text = ""
    chunk_n = 0
    try:
        doc_ids = [r.id for r in doc_rows]
        if doc_ids:
            async with async_session_maker() as s:
                chunk_rows = (await s.execute(
                    select(Chunk.content, Chunk.source_section, Document.filename)
                    .join(Document, Document.id == Chunk.document_id)
                    .where(Chunk.document_id.in_(doc_ids))
                    .where(Chunk.review_status != "rejected")
                    .order_by(Chunk.citation_count.desc())
                    .limit(30)
                )).all()
            chunk_n = len(chunk_rows)
            chunks_text = "\n\n".join(
                f"[{r.filename or '未知文档'}{(' · ' + r.source_section) if r.source_section else ''}]\n{(r.content or '')[:400]}"
                for r in chunk_rows
            )
        yield {"type": "stage_done", "id": "chunks",
               "detail": f"{chunk_n} 条切片"}
    except Exception as e:
        yield {"type": "error", "message": f"检索切片失败：{e}"}
        return

    # ── 4. LLM 抽取 ──────────────────────────────────────
    yield {"type": "stage_start", "id": "llm", "label": "AI 综合素材并抽取字段"}

    docs_summary = "\n".join(
        f"- {r.filename}（{r.doc_type or '未分类'}）: {(r.summary or '')[:200]}"
        for r in doc_rows
    ) if doc_rows else "（无关联文档）"

    meta_block = "（无项目元数据）"
    if proj:
        meta_block = f"""项目名称：{proj.name}
客户：{proj.customer or '—'}
行业：{proj.industry or '—'}
启动日期：{proj.kickoff_date.isoformat() if proj.kickoff_date else '—'}
实施模块：{', '.join(proj.modules or []) or '—'}
项目描述：{proj.description or '—'}
客户画像：{proj.customer_profile or '—'}"""

    schema_block = _format_schema_for_prompt(schema)
    prompt = f"""【交付物类型】{output_kind}

【项目元数据】
{meta_block}

【关联文档摘要】
{docs_summary}

【项目相关切片（节选，作为引用素材）】
{chunks_text or '（无相关切片）'}

【需要抽取的字段 schema】
{schema_block}

请按系统提示要求，输出 JSON。所有 schema 中的 key 都必须出现在 fields 中。"""

    from services.output_service import _llm_call
    try:
        raw = await _llm_call(prompt, system=EXTRACT_SYSTEM, model=model, max_tokens=6000, timeout=240.0)
    except Exception as e:
        yield {"type": "error", "message": f"LLM 调用失败：{e}"}
        return

    out = _parse_brief_response(raw, schema)
    if not out:
        out = empty_brief(output_kind)
        yield {"type": "stage_done", "id": "llm", "detail": "解析失败，已返回空骨架"}
    else:
        filled = sum(1 for cell in out.values() if cell.get("value") not in (None, "", []))
        yield {"type": "stage_done", "id": "llm", "detail": f"{filled}/{len(schema)} 字段已抽取"}

    yield {"type": "done", "fields": out}


async def extract_brief_draft(project_id: str, output_kind: str, model: str | None = None) -> dict:
    """非流式封装：跑完 stream，取 done 事件的 fields。"""
    fields: dict = {}
    async for ev in stream_extract_brief_draft(project_id, output_kind, model):
        if ev.get("type") == "done":
            fields = ev.get("fields") or {}
        elif ev.get("type") == "error":
            return empty_brief(output_kind)
    return fields or empty_brief(output_kind)


def render_brief_for_prompt(brief_fields: dict, schema: list[dict]) -> str:
    """把已确认的 brief 拼成给生成 prompt 的 markdown 块。空字段跳过。"""
    if not brief_fields or not schema:
        return ""
    by_group: dict[str, list[str]] = {}
    for f in schema:
        cell = (brief_fields or {}).get(f["key"]) or {}
        v = cell.get("value")
        if v is None or (isinstance(v, str) and not v.strip()) or (isinstance(v, list) and not v):
            continue
        if isinstance(v, list):
            body = "\n".join(f"  - {item}" for item in v)
        else:
            body = str(v).strip()
        line = f"- **{f['label']}**：\n{body}" if isinstance(v, list) else f"- **{f['label']}**：{body}"
        by_group.setdefault(f.get("group") or "其他", []).append(line)
    if not by_group:
        return ""
    blocks = []
    for grp, lines in by_group.items():
        blocks.append(f"### {grp}\n" + "\n".join(lines))
    return "\n\n".join(blocks)
