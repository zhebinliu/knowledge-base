"""会议纪要模板演化服务。

分析用户手动编辑后的纪要 + KB 项目会议文档，
使用 LLM 推导出改进的模板定义，并持久化到 meeting_templates 表。
活跃模板会在生成纪要时注入 system prompt。
"""
from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from models import async_session_maker
from models.meeting import Meeting
from models.template import MeetingTemplate
from prompts.meeting import MINUTES_SYSTEM
from services._time import iso_utc
from services.model_router import model_router
from services._time import utcnow_naive as _utcnow

logger = logging.getLogger(__name__)

# ── 采样限额 ──────────────────────────────────────────────────────────────

_MAX_EDITED_SAMPLE = 20
_MAX_KB_SAMPLE = 30


# ── LLM 分析用 prompt ────────────────────────────────────────────────────

_TEMPLATE_ANALYSIS_SYSTEM = (
    "你是一位资深的文档格式分析专家，擅长从大量会议纪要样本中提炼出最佳模板结构。\n"
    "你的任务是比较用户手动编辑后的会议纪要（编辑版）与 AI 原始生成的会议纪要（原始版），\n"
    "同时参考知识库中其他项目的会议纪要文档格式，综合得出一个更优的会议纪要模板。\n"
    "\n"
    "## 分析要点\n"
    "1. **结构差异**：编辑版比原始版增加了哪些字段/章节？删减了什么？改变了顺序吗？\n"
    "2. **格式偏好**：用户是否倾向于更详细或更简洁的表述？使用了什么特殊格式？\n"
    "3. **风格特点**：语气是正式还是随意？是否更注重数据/时间/负责人等细节？\n"
    "4. **KB 参考**：知识库中的会议纪要文档采用了什么结构？有什么值得借鉴的格式规范？\n"
    "5. **通用模式**：哪些差异是编辑者个人的（不应纳入模板），哪些是普遍偏好（应纳入模板）？\n"
    "\n"
    "## 输出要求\n"
    "必须严格按以下 JSON 格式输出，仅输出 JSON 本身，不要包含任何其他文字或代码块标记：\n"
    "{\n"
    '  "change_log": "版本变更说明（50-200字，描述本版本与上一版的区别）",\n'
    '  "format_requirements": "自然语言描述的格式要求段落（将被注入 AI system prompt）",\n'
    '  "style_preferences": "自然语言描述的风格偏好段落（将被注入 AI system prompt）",\n'
    '  "schema_structure": "期望的 JSON 输出结构的文本描述",\n'
    '  "source_meeting_ids": [1, 2, 3],\n'
    '  "source_kb_doc_refs": ["kb_doc_id_1", "kb_doc_id_2"]\n'
    "}"
)

_USER_ANALYSIS_TEMPLATE = """## 原始 AI 生成版 vs 用户编辑版对比

以下展示了 {count} 个会议的 AI 原始生成版本与用户手动编辑版本的结构差异。
请分析用户编辑的共性趋势，提取出可纳入模板改进的模式。

{comparisons}

## 知识库会议纪要文档结构参考

以下展示了 {kb_count} 个知识库中其他项目的会议纪要文档的结构和格式特点，
可作为模板迭代的参考素材。

{kb_docs}

请综合以上信息，输出改进后的模板定义。"""


# ── JSON 安全解析 ─────────────────────────────────────────────────────────

def _safe_json(val: str, default=None):
    if not val:
        return default
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return default


# ── 对比文本渲染 ──────────────────────────────────────────────────────────

def _minutes_to_comparable(minutes_obj: dict | None) -> str:
    """将纪要 dict 归一化为可对比的文本块。"""
    obj = minutes_obj or {}
    if not isinstance(obj, dict):
        return str(obj)[:500]
    parts: list[str] = []
    for key in ("summary", "meeting_title"):
        v = obj.get(key)
        if v:
            parts.append(f"[{key}] {v}")
    for key, label in (
        ("attendees", "参会人员"),
        ("key_points", "讨论要点"),
        ("decisions", "决策事项"),
        ("action_items", "待办事项"),
        ("unresolved", "未决问题"),
    ):
        items = obj.get(key)
        if not items:
            continue
        if isinstance(items, list) and items:
            parts.append(f"\n[{label}]")
            for item in items[:10]:
                if isinstance(item, dict):
                    text = json.dumps(item, ensure_ascii=False)[:200]
                elif isinstance(item, str):
                    text = item[:200]
                else:
                    text = str(item)[:200]
                parts.append(f"  - {text}")
    return "\n".join(parts)


def _format_comparison(meeting_id: int, title: str, original: dict, edited: dict) -> str:
    """格式化一条对比记录供 LLM 分析。"""
    o = _minutes_to_comparable(original)
    e = _minutes_to_comparable(edited)
    return (
        f"\n----- 会议 ID: {meeting_id} | 标题: {title} -----\n"
        f"[AI 原始版]:\n{o[:1000]}\n\n"
        f"[用户编辑版]:\n{e[:1000]}\n"
    )


# ── 异常 ──────────────────────────────────────────────────────────────────

class TemplateEvolutionError(RuntimeError):
    """模板演化失败时抛出的异常。"""


# ── 主服务 ─────────────────────────────────────────────────────────────────

class TemplateEvolver:
    """编排模板演化过程。"""

    async def evolve(self, method: str = "combined") -> MeetingTemplate:
        """执行完整的模板演化周期。

        Args:
            method: 演化数据来源。``user_edit`` / ``kb_analysis`` / ``combined``。

        Returns:
            新创建并激活的 :class:`MeetingTemplate`。

        Raises:
            TemplateEvolutionError: 数据不足或 LLM 分析失败。
        """
        # 1. 收集数据
        edited_meetings = await self._collect_edited_meetings()
        kb_docs = await self._fetch_kb_meeting_docs()

        use_edits = method in ("user_edit", "combined") and bool(edited_meetings)
        use_kb = method in ("kb_analysis", "combined") and bool(kb_docs)

        if not use_edits and not use_kb:
            raise TemplateEvolutionError(
                "没有可用于演化的数据。需要至少一个用户编辑过的会议或 KB 会议文档。"
            )

        # 2. 构建分析输入
        analysis_input = self._build_analysis_input(
            edited_meetings if use_edits else [],
            kb_docs if use_kb else [],
        )

        # 3. 调用 LLM 分析
        llm_output = await self._analyze_with_llm(analysis_input)

        # 4. 持久化新模板
        template = await self._create_template_from_analysis(
            llm_output, method=method,
        )
        return template

    async def get_evolvable_system_prompt(self) -> str:
        """返回注入活跃模板后的 MINUTES_SYSTEM。"""
        template_dict = await get_active_template_dict()
        return _build_system_prompt_from_dict(template_dict)

    async def get_active_template(self) -> MeetingTemplate | None:
        """返回当前活跃模板，或 None。"""
        return await self._get_current_active_template()

    async def get_active_template_dict(self) -> dict[str, Any]:
        """返回当前活跃模板的 dict 表示。"""
        return await get_active_template_dict()

    # ── 数据采集 ──────────────────────────────────────────────────────

    async def _collect_edited_meetings(self) -> list[tuple[Meeting, dict]]:
        """查询用户编辑过的会议。"""
        async with async_session_maker() as db:
            result = await db.execute(
                select(Meeting)
                .where(
                    and_(
                        Meeting.edited_minutes.isnot(None),
                        Meeting.meeting_minutes.isnot(None),
                    )
                )
                .order_by(Meeting.created_at.desc())
                .limit(_MAX_EDITED_SAMPLE)
            )
            meetings: list[Meeting] = list(result.scalars().all())

        pairs: list[tuple[Meeting, dict]] = []
        for m in meetings:
            edited = m.edited_minutes
            if edited and isinstance(edited, dict):
                pairs.append((m, edited))
        logger.info(
            "TemplateEvolver: collected %d edited meetings", len(pairs)
        )
        return pairs

    async def _fetch_kb_meeting_docs(self) -> list[dict[str, Any]]:
        """从 KB Document 表中获取会议纪要文档。最佳努力，失败返回空列表。"""
        try:
            from models.document import Document
        except ImportError:
            logger.warning("TemplateEvolver: models.document not available")
            return []

        try:
            async with async_session_maker() as db:
                result = await db.execute(
                    select(Document)
                    .where(Document.doc_type == "meeting_notes")
                    .order_by(Document.created_at.desc())
                    .limit(_MAX_KB_SAMPLE)
                )
                docs: list[Any] = list(result.scalars().all())

            out: list[dict[str, Any]] = []
            for d in docs:
                content = getattr(d, "markdown_content", "") or ""
                if not content.strip():
                    continue
                out.append({
                    "id": getattr(d, "id", ""),
                    "filename": getattr(d, "filename", "未命名"),
                    "summary": getattr(d, "summary", "") or "",
                    "markdown_content": content,
                    "project_id": getattr(d, "project_id", None),
                })
            logger.info(
                "TemplateEvolver: collected %d KB meeting docs", len(out)
            )
            return out
        except Exception:
            logger.exception("TemplateEvolver: KB fetch failed")
            return []

    # ── LLM 分析 ──────────────────────────────────────────────────────

    def _build_analysis_input(
        self,
        edited_meetings: list[tuple[Meeting, dict]],
        kb_docs: list[dict[str, Any]],
    ) -> str:
        """组装 LLM 分析用的用户消息。"""
        comparisons: list[str] = []
        for meeting, edited in edited_meetings[:12]:
            original = meeting.meeting_minutes if isinstance(meeting.meeting_minutes, dict) else {}
            comparisons.append(
                _format_comparison(
                    meeting_id=meeting.id,
                    title=meeting.title,
                    original=original,
                    edited=edited,
                )
            )

        kb_texts: list[str] = []
        for doc in kb_docs[:15]:
            filename = doc.get("filename", "")
            content = (doc.get("markdown_content") or "")[:800]
            summary = (doc.get("summary") or "")[:300]
            kb_texts.append(
                f"\n----- KB 文档: {filename} -----\n"
                f"摘要: {summary}\n"
                f"内容片段: {content}\n"
            )

        return _USER_ANALYSIS_TEMPLATE.format(
            count=len(comparisons),
            comparisons="\n".join(comparisons),
            kb_count=len(kb_texts),
            kb_docs="\n".join(kb_texts),
        )

    async def _analyze_with_llm(self, analysis_input: str) -> dict[str, Any]:
        """调用 LLM 分析样本并返回模板定义。"""
        messages = [
            {"role": "system", "content": _TEMPLATE_ANALYSIS_SYSTEM},
            {"role": "user", "content": analysis_input},
        ]
        content, md = await model_router.chat_with_routing(
            task="meeting_template_evolve",
            messages=messages,
            temperature=0.4,
            max_tokens=8000,
        )
        return self._parse_analysis(content)

    @staticmethod
    def _parse_analysis(raw: str) -> dict[str, Any]:
        """解析 LLM 返回的 JSON。"""
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]).strip() if len(lines) > 2 else ""
        try:
            result = json.loads(text)
            logger.info("Template analysis parsed successfully")
            return result
        except (json.JSONDecodeError, TypeError) as exc:
            logger.error(
                "Failed to parse template analysis: %s\nRaw: %s", exc, raw
            )
            raise TemplateEvolutionError(
                f"LLM output was not valid JSON: {exc}"
            ) from exc

    # ── 模板持久化 ────────────────────────────────────────────────────

    async def _create_template_from_analysis(
        self, analysis: dict[str, Any], method: str,
    ) -> MeetingTemplate:
        """持久化新模板版本并激活它。"""
        change_log = (analysis.get("change_log") or "").strip()
        format_req = (analysis.get("format_requirements") or "").strip()
        style_prefs = (analysis.get("style_preferences") or "").strip()
        schema_raw = analysis.get("schema_structure")
        src_meeting_ids = json.dumps(
            analysis.get("source_meeting_ids", []), ensure_ascii=False
        )
        src_kb_refs = json.dumps(
            analysis.get("source_kb_doc_refs", []), ensure_ascii=False
        )

        schema_str: str = ""
        if isinstance(schema_raw, str):
            schema_str = schema_raw
        elif isinstance(schema_raw, dict):
            schema_str = json.dumps(schema_raw, ensure_ascii=False)
        elif schema_raw:
            schema_str = str(schema_raw)

        async with async_session_maker() as db:
            # 去激活当前所有活跃模板
            from sqlalchemy import text as _text
            await db.execute(
                _text("UPDATE meeting_templates SET is_active = false WHERE is_active = true")
            )

            # 确定下一个版本号
            latest_result = await db.execute(
                select(MeetingTemplate)
                .order_by(MeetingTemplate.version.desc())
                .limit(1)
            )
            latest = latest_result.scalar_one_or_none()
            next_version = (latest.version + 1) if latest else 1

            template = MeetingTemplate(
                name=f"迭代模板 v{next_version}",
                description=f"由 AI 自动分析 {method} 数据后生成的模板。",
                schema_structure=schema_str,
                format_requirements=format_req,
                style_preferences=style_prefs,
                version=next_version,
                is_active=True,
                source_meeting_ids=src_meeting_ids,
                source_kb_doc_refs=src_kb_refs,
                evolution_method=method,
                change_log=change_log or f"基于 {method} 数据自动演化",
            )
            db.add(template)
            await db.commit()
            await db.refresh(template)
            logger.info(
                "Template evolved to v%s (id=%s, method=%s)",
                next_version, template.id, method,
            )
            return template

    async def _get_current_active_template(self) -> MeetingTemplate | None:
        """查询当前活跃的模板。"""
        async with async_session_maker() as db:
            result = await db.execute(
                select(MeetingTemplate)
                .where(MeetingTemplate.is_active == True)  # noqa: E712
                .limit(1)
            )
            return result.scalar_one_or_none()


# ── 独立辅助函数 ──────────────────────────────────────────────────────────


async def get_active_template_dict() -> dict[str, Any]:
    """查询当前活跃模板的 dict 表示（无需 TemplateEvolver 实例）。"""
    async with async_session_maker() as db:
        result = await db.execute(
            select(MeetingTemplate)
            .where(MeetingTemplate.is_active == True)  # noqa: E712
            .limit(1)
        )
        tpl = result.scalar_one_or_none()
        if tpl is None:
            return {}
        return _template_to_dict(tpl)


def _template_to_dict(tpl: MeetingTemplate) -> dict[str, Any]:
    """ORM → plain dict。"""
    return {
        "id": tpl.id,
        "name": tpl.name,
        "description": tpl.description or "",
        "schema_structure": tpl.schema_structure or "",
        "format_requirements": tpl.format_requirements or "",
        "style_preferences": tpl.style_preferences or "",
        "version": tpl.version,
        "is_active": tpl.is_active,
        "source_meeting_ids": _safe_json(tpl.source_meeting_ids, []),
        "source_kb_doc_refs": _safe_json(tpl.source_kb_doc_refs, []),
        "evolution_method": tpl.evolution_method,
        "change_log": tpl.change_log or "",
        "created_at": iso_utc(tpl.created_at) or "",
        "updated_at": iso_utc(tpl.updated_at) or "",
    }


def _build_system_prompt_from_dict(template_dict: dict | None) -> str:
    """将模板偏好注入到 MINUTES_SYSTEM 尾部。

    这是 minutes_generator.generate 中使用的注入逻辑。
    """
    if not template_dict:
        return MINUTES_SYSTEM
    parts = [MINUTES_SYSTEM]
    f = (template_dict.get("format_requirements") or "").strip()
    s = (template_dict.get("style_preferences") or "").strip()
    sc = (template_dict.get("schema_structure") or "").strip()
    if f:
        parts.append(f"\n## 格式要求\n{f}\n")
    if s:
        parts.append(f"\n## 风格偏好\n{s}\n")
    if sc:
        parts.append(f"\n## 期望的输出结构\n{sc}\n")
    return "\n".join(parts)
