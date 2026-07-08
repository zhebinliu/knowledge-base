"""实时会议纪要提取(2026-06-30)。

基于截至目前的转写,实时提取结构化会议纪要(共识/争议点/代办)。
参考 live_advice.py 的架构:内容驱动、反幻觉、去重、独立失败。
独立于录音/纪要主链路,失败不影响录音。
"""
from __future__ import annotations

import re
import structlog
from sqlalchemy import select

from models import async_session_maker
from models.meeting import Meeting
from services.llm_json import loads_lenient
from services.model_router import model_router
from prompts.meeting import LIVE_MINUTES_SYSTEM, LIVE_MINUTES_USER

logger = structlog.get_logger()

_PARSE_FAIL = object()
_MIN_TRANSCRIPT_CHARS = 40   # 转写太短没意义
_CTX_LIMIT = 16000           # 喂给 LLM 的转写上限(超了取头 4k + 尾)

_DEFAULT_SECTIONS = ["meeting_consensus", "meeting_disputes", "meeting_todos"]


def _bound_transcript(t: str) -> str:
    """长会控上下文:超限时保留开头(前期共识需要)+ 近段全文。"""
    if len(t) <= _CTX_LIMIT:
        return t
    return t[:4000] + "\n…(中间省略)…\n" + t[-(_CTX_LIMIT - 4000):]


def _norm(s: str) -> str:
    """归一化:去空白/标点/下划线 + 小写,用于内容出处比对。"""
    return re.sub(r"[\s\W_]+", "", s or "").lower()


def _content_grounded(content: str, norm_transcript: str) -> bool:
    """反幻觉:提取的内容至少有一个 6 字以上连续片段能在转写中找到。
    比 live_advice 的逐句引用校验宽松——纪要内容是概括性的,只需部分关键词命中即可。"""
    c = _norm(content)
    if len(c) < 6:
        return True  # 过短不校验
    # 检查是否至少有 6 字连续命中
    for i in range(0, len(c) - 6 + 1, 4):
        if c[i:i + 6] in norm_transcript:
            return True
    return False


def _build_system_prompt(template_text: str, agenda: str) -> str:
    """构建 system prompt,注入自定义模板(如有)。"""
    custom = ""
    if template_text:
        try:
            import json
            tmpl = json.loads(template_text)
            if tmpl.get("type") == "text" and tmpl.get("sections"):
                sections = tmpl["sections"]
                labels = "、".join(sections)
                custom = (
                    f"\n## 自定义纪要格式\n"
                    f"本次会议使用自定义纪要模板,包含以下章节:{labels}。\n"
                    f"请将提取内容按以下字段输出:"
                    + "、".join(f"{s}" for s in sections)
                    + "。\n"
                )
                if agenda:
                    custom += f"参考会议议程:{agenda}\n"
        except (json.JSONDecodeError, KeyError):
            pass  # 模板解析失败,用默认格式
    return LIVE_MINUTES_SYSTEM.format(custom_template_section=custom)


def _parse_template_sections(template_text: str) -> list[str]:
    """从模板字符串中解析 section 名称列表。"""
    if not template_text:
        return _DEFAULT_SECTIONS
    try:
        import json
        tmpl = json.loads(template_text)
        if tmpl.get("type") == "text" and tmpl.get("sections"):
            return tmpl["sections"]
    except (json.JSONDecodeError, KeyError):
        pass
    return _DEFAULT_SECTIONS


async def get_live_minutes(meeting_id: int) -> dict:
    """只读:返回当前 live_minutes + agenda + memo,不跑 LLM(前端轮询用)。"""
    async with async_session_maker() as session:
        meeting = await session.get(Meeting, meeting_id)
        if not meeting:
            return {"live_minutes": None, "agenda": "", "memo": "", "error": "meeting_not_found"}
    return {
        "live_minutes": meeting.live_minutes,
        "agenda": meeting.agenda or "",
        "memo": meeting.memo or "",
    }


async def generate_live_minutes(meeting_id: int) -> dict:
    """跑一轮实时纪要提取:基于当前转写增量更新 live_minutes。"""
    async with async_session_maker() as session:
        meeting = await session.get(Meeting, meeting_id)
        if not meeting:
            return {"live_minutes": None, "error": "meeting_not_found"}
        transcript = (meeting.raw_transcript or "").strip()
        existing = meeting.live_minutes or {}
        template_text = meeting.live_minutes_template or ""
        agenda = meeting.agenda or ""

    if len(transcript) < _MIN_TRANSCRIPT_CHARS:
        return {"live_minutes": existing, "note": "transcript_too_short"}

    # 构建已有纪要的文本摘要,喂给 LLM 做增量更新
    sections = _parse_template_sections(template_text)
    existing_lines = []
    for key in sections:
        val = existing.get(key, "")
        if val:
            existing_lines.append(f"【{key}】{val}")
    existing_text = "\n".join(existing_lines) if existing_lines else "(暂无已有纪要)"

    system_prompt = _build_system_prompt(template_text, agenda)
    bounded = _bound_transcript(transcript)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": LIVE_MINUTES_USER.format(
            agenda=agenda or "(未设置议程)",
            existing_minutes=existing_text,
            transcript=bounded,
        )},
    ]

    try:
        content, model = await model_router.chat_with_routing(
            task="meeting_live_minutes",
            messages=messages,
            temperature=0.3,
            max_tokens=8000,
            response_format={"type": "json_object"},
        )
    except Exception as e:
        logger.exception("live_minutes_llm_failed", meeting_id=meeting_id, error=str(e)[:200])
        return {"live_minutes": existing, "error": "llm_failed"}

    parsed = loads_lenient(content, _PARSE_FAIL)
    if parsed is _PARSE_FAIL or not isinstance(parsed, dict):
        logger.warning("live_minutes_parse_failed", meeting_id=meeting_id, raw=(content or "")[:200])
        return {"live_minutes": existing, "error": "parse_failed"}

    # 反幻觉 + 增量合并:对每个 section,如果新内容能在转写中找到依据就采用,否则保留旧值
    norm_transcript = _norm(transcript)
    result = {}
    for key in sections:
        new_val = (parsed.get(key) or "").strip()
        old_val = (existing.get(key) or "").strip()
        if not new_val:
            # LLM 本轮没有新内容,保留旧值
            result[key] = old_val
        elif not _content_grounded(new_val, norm_transcript):
            # 反幻觉:新内容在转写中找不到依据,保留旧值
            result[key] = old_val
        else:
            # 增量合并:新内容追加到旧内容后面
            if old_val:
                result[key] = old_val + "\n" + new_val
            else:
                result[key] = new_val

    # 去重:同一 section 内去除重复行
    for key in sections:
        if result.get(key):
            lines = [ln.strip() for ln in result[key].split("\n") if ln.strip()]
            seen = set()
            unique = []
            for ln in lines:
                normalized = _norm(ln)
                if normalized and normalized not in seen and len(normalized) >= 2:
                    seen.add(normalized)
                    unique.append(ln)
            result[key] = "\n".join(unique)

    # 持久化
    async with async_session_maker() as session:
        meeting = await session.get(Meeting, meeting_id)
        if meeting:
            meeting.live_minutes = result
            await session.commit()

    logger.info("live_minutes_done", meeting_id=meeting_id, model=model)
    return {"live_minutes": result, "model": model}


GENERATE_SUMMARY_SYSTEM = (
    "你是一位资深的会议纪要撰写专家,负责根据会议的多源信息生成一份规整、专业、可直接交付的会议纪要。\n"
    "\n"
    "你将收到以下输入:\n"
    "1. 会议议程:会前设定的议题\n"
    "2. 会议备忘:参会者在会议中随手记录的要点\n"
    "3. 实时会议纪要:AI 在会议进行中实时提取的共识、争议点和代办事项\n"
    "4. 会议转写:完整的会议对话记录\n"
    "\n"
    "你的任务是综合以上信息,产出一份结构清晰、内容完整的会议纪要。\n"
    "输出 JSON 格式,包含以下字段:\n"
    "- meeting_title:会议标题\n"
    "- meeting_time:会议时间(如能从内容中推断)\n"
    "- summary:2-4 句概述,概括会议核心内容和结论\n"
    "- key_points:[{topic, content}] 会议要点列表\n"
    "- decisions:[{content, owner}] 已做出的决策/达成的共识\n"
    "- action_items:[{task, owner, deadline, priority}] 待办事项,含负责人/截止时间/优先级\n"
    "- unresolved:[{issue, owner, reason}] 未解决的争议点或待定议题\n"
    "\n"
    "原则:\n"
    "- 综合四源信息,互补增强:议程提供框架,备忘补充细节,实时纪要素材可直接采纳,转写验证准确性\n"
    "- 去重合并:同一事项在多个来源中出现,只保留一条,取最完整的描述\n"
    "- 用专业简洁的语言,保留关键数字、人名、时间\n"
    "- 只输出 JSON,不要任何解释或开场白\n"
)

GENERATE_SUMMARY_USER = """## 会议议程
{agenda}

## 会议备忘(参会者随手记录)
{memo}

## AI 实时提取的会议纪要
{live_minutes_text}

## 会议转写(完整记录)
{transcript}

---
请综合以上信息,生成规整的会议纪要。只输出如下 JSON:
{{
  "meeting_title": "会议标题",
  "meeting_time": "会议时间(如能推断)",
  "summary": "2-4 句概述",
  "key_points": [{{"topic": "要点主题", "content": "详细内容"}}],
  "decisions": [{{"content": "决策/共识内容", "owner": "负责人"}}],
  "action_items": [{{"task": "待办事项", "owner": "负责人", "deadline": "截止时间", "priority": "high|medium|low"}}],
  "unresolved": [{{"issue": "争议点/未决议题", "owner": "相关方", "reason": "未解决原因"}}]
}}"""


async def generate_meeting_summary(meeting_id: int, session=None) -> dict:
    """会后生成规整纪要:结合 agenda + memo + live_minutes + transcript。"""
    own_session = session is None
    if own_session:
        session = async_session_maker()
    try:
        meeting = await session.get(Meeting, meeting_id)
        if not meeting:
            return {"error": "meeting_not_found"}

        agenda = meeting.agenda or ""
        memo = meeting.memo or ""
        live_minutes = meeting.live_minutes or {}
        transcript = (meeting.raw_transcript or "")[:12000]  # 截断,长会议取前 12k 字

        # 格式化 live_minutes 为文本
        lm_lines = []
        for key, val in live_minutes.items():
            if val:
                lm_lines.append(f"【{key}】\n{val}")
        live_minutes_text = "\n\n".join(lm_lines) if lm_lines else "(暂无)"

        messages = [
            {"role": "system", "content": GENERATE_SUMMARY_SYSTEM},
            {"role": "user", "content": GENERATE_SUMMARY_USER.format(
                agenda=agenda or "(未设置)",
                memo=memo or "(无备忘)",
                live_minutes_text=live_minutes_text,
                transcript=transcript,
            )},
        ]

        try:
            content, model = await model_router.chat_with_routing(
                task="meeting_generate_summary",
                messages=messages,
                temperature=0.3,
                max_tokens=8000,
                response_format={"type": "json_object"},
            )
        except Exception as e:
            logger.exception("generate_summary_llm_failed", meeting_id=meeting_id, error=str(e)[:200])
            return {"error": "llm_failed"}

        parsed = loads_lenient(content, _PARSE_FAIL)
        if parsed is _PARSE_FAIL or not isinstance(parsed, dict):
            return {"error": "parse_failed", "meeting_minutes": None}

        logger.info("generate_summary_done", meeting_id=meeting_id, model=model)
        return {"meeting_minutes": parsed, "model": model}
    finally:
        if own_session:
            await session.close()
