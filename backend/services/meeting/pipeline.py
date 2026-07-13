"""会议纪要 AI pipeline 四阶段实现。

每个阶段都通过 kb-system 的 model_router 调用 LLM,自动 fallback。
对 JSON 输出阶段统一加 response_format 强制 + 解析容错。
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import structlog

from prompts.meeting import (
    POLISH_SYSTEM,
    POLISH_USER,
    MINUTES_SYSTEM,
    MINUTES_USER,
    REQUIREMENT_SYSTEM,
    REQUIREMENT_USER,
    PROCESS_FLOW_SYSTEM,
    PROCESS_FLOW_USER,
    STAKEHOLDER_SYSTEM,
    STAKEHOLDER_USER,
    build_illustration_system,
    ILLUSTRATION_USER_TEMPLATE,
)
from services.ai.template_evolver import _build_system_prompt_from_dict
from services.model_router import model_router

logger = structlog.get_logger()


# ── JSON 解析容错 ────────────────────────────────────────────────────────

_PARSE_FAIL = object()


def _safe_json_loads(text: str, default: Any) -> Any:
    """容错 JSON 解析(复用全后端共享的 services.llm_json.loads_lenient:
    去围栏 / 注释 / **尾随逗号** + 最长平衡块兜底)。失败返回 default 并记一条 warning。"""
    from services.llm_json import loads_lenient
    result = loads_lenient(text, _PARSE_FAIL)
    if result is _PARSE_FAIL:
        logger.warning("meeting_json_parse_failed", raw=(text or "")[:200])
        return default
    return result


def _json_output_valid(content: str, finish_reason: str | None) -> bool:
    """chat_with_routing 校验器:拒绝「被截断」或「无法解析为 JSON」的输出。

    背景:会议各 JSON 抽取阶段此前不带 validator,主模型一旦把输出截断
    (finish_reason='length'),HTTP 200 仍被当成功返回,再经 _safe_json_loads
    解析失败 → 静默落空列表(用户表现:能点「生成」但内容全空、且不报错)。
    带上本校验后:截断 / 坏 JSON → 回退 fallback(mimo-v2-pro,1M 上下文);
    主备都过不了 → chat_with_routing 抛 ModelOutputError,由调用方暴露为可见错误。
    """
    from services.llm_json import loads_lenient
    if finish_reason == "length":
        return False
    return loads_lenient(content, _PARSE_FAIL) is not _PARSE_FAIL


# ── 阶段 1:润色 ─────────────────────────────────────────────────────────

# 长稿(>_POLISH_CHUNK_THRESHOLD 字符)按 [MM:SS] 行边界切成 ~_POLISH_CHUNK_CHARS 字符
# 的块、并行润色。规避两个痛点:① 单次 25k+ 字符输出顶 max_tokens 截断;② 推理模型
# 全局思考时把 [101:33] 压缩成 [55:08]。每块约 8000 字符输入 / 6000 字符输出,远在
# 任何模型的 output cap 之下。失败块用原文兜底,保住时间戳和内容。
_POLISH_CHUNK_THRESHOLD = 12000
_POLISH_CHUNK_CHARS = 8000


def _split_by_lines(raw: str, target_chars: int) -> list[str]:
    """按换行边界切分;每块尽量接近 target_chars,但不打破行(行通常以 [MM:SS] 起头)。"""
    lines = raw.split("\n")
    chunks: list[str] = []
    cur: list[str] = []
    cur_len = 0
    for ln in lines:
        ln_len = len(ln) + 1
        if cur and cur_len + ln_len > target_chars:
            chunks.append("\n".join(cur))
            cur, cur_len = [ln], ln_len
        else:
            cur.append(ln)
            cur_len += ln_len
    if cur:
        chunks.append("\n".join(cur))
    return chunks


async def _polish_one(text: str, term_hints: str = "") -> str:
    """单次润色调用。GLM-5.x 默认开思考(会重排时间戳),显式 thinking=disabled 关掉。
    
    term_hints: 用户的名词校正清单提示词(为空则不注入)。
    """
    system = POLISH_SYSTEM
    user_content = POLISH_USER.format(raw_transcript=text)
    if term_hints:
        user_content = term_hints + "\n\n" + user_content
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]
    content, _model = await model_router.chat_with_routing(
        task="meeting_transcript_polish",
        messages=messages,
        temperature=0.2,
        max_tokens=16000,  # 分块后单块输出约 6000 字符 ≈ 4000 tokens,留足余量
        extra_payload={"thinking": {"type": "disabled"}},
    )
    return (content or "").strip()


async def polish_transcript(raw_transcript: str, term_hints: str = "") -> str:
    """对 ASR 原始转写做语言润色。返回纯文本。长稿自动分块并行。
    
    Args:
        raw_transcript: ASR 原始转写文本。
        term_hints: 用户的名词校正提示词(为空则不注入)。
    """
    if not raw_transcript or not raw_transcript.strip():
        return ""

    if len(raw_transcript) <= _POLISH_CHUNK_THRESHOLD:
        out = await _polish_one(raw_transcript, term_hints)
        logger.info("polish_done", in_chars=len(raw_transcript), out_chars=len(out), chunks=1, failed_chunks=0)
        return out

    chunks = _split_by_lines(raw_transcript, _POLISH_CHUNK_CHARS)
    results = await asyncio.gather(*[_polish_one(c, term_hints) for c in chunks], return_exceptions=True)

    parts: list[str] = []
    failed = 0
    for i, (orig, r) in enumerate(zip(chunks, results)):
        if isinstance(r, BaseException) or not r:
            err = str(r)[:160] if isinstance(r, BaseException) else "empty"
            logger.warning("polish_chunk_failed", idx=i, error=err)
            parts.append(orig)  # 失败用原文,保住时间戳和内容
            failed += 1
        else:
            parts.append(r)
    out = "\n".join(parts)
    logger.info("polish_done", in_chars=len(raw_transcript), out_chars=len(out), chunks=len(chunks), failed_chunks=failed)
    return out


# ── 阶段 2:纪要 ─────────────────────────────────────────────────────────

_EMPTY_MINUTES = {
    # 元信息(2026-05-12 加,对齐纷享销客实施纪要模板表头字段)
    "meeting_title": "",
    "meeting_time": "",
    "meeting_location": "",
    "meeting_host": "",
    "meeting_recorder": "",
    "meeting_format": "",
    "organizer": "",
    # 正文内容
    "summary": "",
    "attendees": [],
    "key_points": [],
    "decisions": [],
    "action_items": [],
    "unresolved": [],
}


async def generate_minutes(
    transcript: str,
    meeting_title: str = "",
    template_dict: dict | None = None,
) -> dict:
    """从润色后的 transcript 生成结构化纪要。返回 dict。

    Args:
        transcript: 润色后的转写文本。
        meeting_title: 会议标题。
        template_dict: 可选的活跃模板 dict，用于注入 system prompt。
    """
    if not transcript or not transcript.strip():
        return dict(_EMPTY_MINUTES)

    system_prompt = _build_system_prompt_from_dict(template_dict)

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": MINUTES_USER.format(
                meeting_title=meeting_title or "(未指定)",
                transcript=transcript,
            ),
        },
    ]
    # 2026-06-03 max_tokens 8000→16000:22k+ 字符长会议时 minutes JSON 输出
    # (含 summary + 5-15 个 key_points + decisions + action_items + unresolved 列表)
    # 容易超 8000,被截断 → JSON 不平衡 → parse 失败 → 落到空 default(用户表现:有完成态但内容全空)
    content, model = await model_router.chat_with_routing(
        task="meeting_minutes_extract",
        messages=messages,
        temperature=0.2,
        max_tokens=16000,
        validator=_json_output_valid,  # 空/截断/坏 JSON → 自动回退备用模型;主备都失败 → 抛错 → 会议标 failed(可重生),不再静默落空
        response_format={"type": "json_object"},
    )
    result = _safe_json_loads(content, dict(_EMPTY_MINUTES))
    logger.info(
        "minutes_done",
        model=model,
        keys=list(result.keys()) if isinstance(result, dict) else None,
        raw_chars=len(content or ""),
    )
    return result


# ── 阶段 3:需求提取 ────────────────────────────────────────────────────

async def extract_requirements(transcript: str) -> list[dict]:
    """提取 CRM 实施需求。返回需求 dict 列表。"""
    if not transcript or not transcript.strip():
        return []

    messages = [
        {"role": "system", "content": REQUIREMENT_SYSTEM},
        {"role": "user", "content": REQUIREMENT_USER.format(transcript=transcript)},
    ]
    # max_tokens 8000→16000 + validator:长会议需求清单 JSON 易超 8000 被截断,
    # 此前无 validator → 截断输出被当成功 → 解析失败落空列表、不报错(同 generate_minutes
    # 2026-06-03 的修复)。validator 让截断/坏 JSON 触发回退,主备都失败则抛错可见。
    content, model = await model_router.chat_with_routing(
        task="meeting_requirements_extract",
        messages=messages,
        validator=_json_output_valid,
        temperature=0.2,
        max_tokens=16000,
        response_format={"type": "json_object"},
    )
    result = _safe_json_loads(content, {"requirements": []})
    # 兼容模型直接吐数组的情况
    items = result.get("requirements", []) if isinstance(result, dict) else (result if isinstance(result, list) else [])
    # 字段兜底 + req_id 重编号
    cleaned: list[dict] = []
    for idx, raw in enumerate(items, start=1):
        if not isinstance(raw, dict):
            continue
        cleaned.append({
            "req_id": raw.get("req_id") or f"REQ-{idx:03d}",
            "module": (raw.get("module") or "").strip(),
            "description": (raw.get("description") or "").strip(),
            "priority": raw.get("priority") or "P2",
            "source": (raw.get("source") or "").strip() or None,
            "speaker": (raw.get("speaker") or "").strip() or None,
            "status": "待确认",
            "start_seconds": raw.get("start_seconds"),
            "end_seconds": raw.get("end_seconds"),
        })
    logger.info("requirements_done", model=model, count=len(cleaned))
    return cleaned


# ── 阶段 3.5:业务流程 / 工作流识别(Mermaid) ─────────────────────────────

_EMPTY_PROCESS_FLOWS = {"flows": [], "version": 1}


def _normalize_mermaid(raw: str) -> str:
    """去围栏 + 修保留字节点 id + 修菱形括号错配。

    生成期归一化:统一委托给 `services.meeting.mermaid_repair.repair_mermaid`
    (跟定期巡检任务共用同一套确定性修复逻辑,避免两处漂移)。
    保留字修复(end→node_end 等)+ 菱形括号错配(`{文字]`→`{文字}`)都在那里。
    """
    from services.meeting.mermaid_repair import repair_mermaid
    return repair_mermaid(raw)


async def extract_process_flows(transcript: str) -> dict:
    """识别会议中的业务流程/工作流,返回 Mermaid 流程图列表。"""
    if not transcript or not transcript.strip():
        return dict(_EMPTY_PROCESS_FLOWS)

    messages = [
        {"role": "system", "content": PROCESS_FLOW_SYSTEM},
        {"role": "user", "content": PROCESS_FLOW_USER.format(transcript=transcript)},
    ]
    # max_tokens 8000→16000 + validator:多张 Mermaid 流程图的 JSON 易超 8000 被截断,
    # 同 extract_requirements。截断/坏 JSON 触发回退,主备都失败则抛错可见(不再静默落空)。
    content, model = await model_router.chat_with_routing(
        task="meeting_process_flows_extract",
        messages=messages,
        validator=_json_output_valid,
        temperature=0.2,
        max_tokens=16000,
        response_format={"type": "json_object"},
    )
    result = _safe_json_loads(content, dict(_EMPTY_PROCESS_FLOWS))
    if not isinstance(result, dict):
        result = dict(_EMPTY_PROCESS_FLOWS)
    items = result.get("flows", [])
    if not isinstance(items, list):
        items = []

    cleaned: list[dict] = []
    for idx, raw in enumerate(items, start=1):
        if not isinstance(raw, dict):
            continue
        mermaid = _normalize_mermaid(raw.get("mermaid") or "")
        if not mermaid:
            continue
        cleaned.append({
            "flow_id": raw.get("flow_id") or f"FLOW-{idx:03d}",
            "title": (raw.get("title") or f"流程 {idx}").strip(),
            "category": (raw.get("category") or "业务流程").strip(),
            "summary": (raw.get("summary") or "").strip(),
            "description": (raw.get("description") or "").strip(),
            "source": (raw.get("source") or "").strip() or None,
            "speaker": (raw.get("speaker") or "").strip() or None,
            "start_seconds": raw.get("start_seconds"),
            "end_seconds": raw.get("end_seconds"),
            "mermaid": mermaid,
        })
    logger.info("process_flows_done", model=model, count=len(cleaned))
    return {"flows": cleaned, "version": 1}


# ── 阶段 4:干系人图谱 ─────────────────────────────────────────────────

_EMPTY_STAKEHOLDERS = {"stakeholders": [], "relations": []}


def _render_kb_docs(kb_docs: list[dict] | None) -> str:
    """把可选的 KB 文档渲染成 prompt 注入块。"""
    if not kb_docs:
        return "(无)"
    lines = []
    for d in kb_docs[:5]:  # 防止 prompt 过长
        title = d.get("filename") or d.get("name") or "未命名"
        summary = (d.get("summary") or d.get("markdown_content", "") or "")[:1200]
        lines.append(f"## 文档:{title}\n{summary}\n")
    return "\n".join(lines)


async def extract_stakeholders(
    meeting_id: int,
    meeting_title: str,
    transcript: str,
    minutes: dict | None = None,
    kb_docs: list[dict] | None = None,
) -> dict:
    """提取干系人图谱。返回 {stakeholders: [...], relations: [...]}。"""
    if not transcript or not transcript.strip():
        return dict(_EMPTY_STAKEHOLDERS)

    messages = [
        {"role": "system", "content": STAKEHOLDER_SYSTEM},
        {
            "role": "user",
            "content": STAKEHOLDER_USER.format(
                meeting_id=meeting_id,
                meeting_title=meeting_title or "(未指定)",
                transcript=transcript[:30000],  # 防超长
                minutes=json.dumps(minutes or {}, ensure_ascii=False),
                kb_docs=_render_kb_docs(kb_docs),
            ),
        },
    ]
    content, model = await model_router.chat_with_routing(
        task="meeting_stakeholders_extract",
        messages=messages,
        temperature=0.2,
        max_tokens=8000,
        validator=_json_output_valid,  # 同纪要:空/坏 JSON 自动回退,主备都失败抛错(干系人非阻断,仅记 stage_errors)
        response_format={"type": "json_object"},
    )
    result = _safe_json_loads(content, dict(_EMPTY_STAKEHOLDERS))
    if not isinstance(result, dict):
        result = dict(_EMPTY_STAKEHOLDERS)
    result.setdefault("stakeholders", [])
    result.setdefault("relations", [])
    logger.info(
        "stakeholders_done",
        model=model,
        count=len(result.get("stakeholders", [])),
        relations=len(result.get("relations", [])),
    )
    return result


# ── 阶段 5:解释图 ────────────────────────────────────────────────────────

_EMPTY_ILLUSTRATIONS: dict = {"illustrations": [], "version": 1}


async def extract_illustrations(
    transcript: str,
    minutes: dict | None = None,
    style_id: str | None = None,
) -> dict:
    """从会议内容提取认知锚点,为每个锚点生成配图。

    两步流程:
    1. LLM 分析会议内容 → 输出 1 封面 + 3-6 正文图的 prompt 列表
    2. 对每张图调用 MiniMax 图像生成 API → 返回 base64 图片

    Args:
        style_id: cc2image 风格 ID,默认 handdrawn_knowledge_card。
    """
    from prompts.illustration_styles import (
        DEFAULT_STYLE, STYLE_MAP, get_style_description, get_style_name, auto_match_style,
    )

    if not transcript or not transcript.strip():
        logger.warning("illustrations_skip", reason="empty_transcript")
        return dict(_EMPTY_ILLUSTRATIONS)

    # 确定风格
    if not style_id or style_id == "auto":
        style_id = auto_match_style(transcript[:5000])
    if style_id not in STYLE_MAP:
        style_id = DEFAULT_STYLE
    style_name = get_style_name(style_id)
    style_desc = get_style_description(style_id)
    logger.info("illustrations_style", style_id=style_id, style_name=style_name)

    # Step 1: LLM 分析 + 生成 prompt
    context = transcript[:30000]
    if minutes:
        summary = minutes.get("summary", "")
        if summary:
            context = f"会议摘要:{summary}\n\n{context}"

    system_prompt = build_illustration_system(style_id, style_name, style_desc)
    user_prompt = ILLUSTRATION_USER_TEMPLATE.format(
        style_id=style_id, style_name=style_name, transcript=context,
    )
    logger.info("illustrations_step1_llm_start", transcript_chars=len(context))
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    try:
        content, model = await model_router.chat_with_routing(
            task="meeting_illustrations_extract",
            messages=messages,
            temperature=0.4,
            max_tokens=8000,
            response_format={"type": "json_object"},
        )
    except Exception as e:
        logger.error("illustrations_step1_llm_failed", error=str(e)[:300])
        return dict(_EMPTY_ILLUSTRATIONS)

    result = _safe_json_loads(content, dict(_EMPTY_ILLUSTRATIONS))
    if not isinstance(result, dict):
        result = dict(_EMPTY_ILLUSTRATIONS)
    items = result.get("illustrations", [])
    if not isinstance(items, list):
        items = []
    logger.info("illustrations_step1_llm_done", model=model, prompt_count=len(items))

    # Step 2: 逐张调用图像生成 API(每张独立 try/except,单张失败不阻塞整体)
    import time as _time
    cleaned: list[dict] = []
    for idx, raw in enumerate(items, start=1):
        if not isinstance(raw, dict):
            continue
        prompt = (raw.get("prompt") or "").strip()
        if not prompt:
            logger.warning("illustrations_skip_empty_prompt", ill_id=raw.get("id"))
            continue

        ill_id = raw.get("id") or f"ILL-{idx:03d}"
        image_type = raw.get("image_type", "body")
        aspect_ratio = raw.get("aspect_ratio", "16:9")
        image_url = ""
        t0 = _time.monotonic()
        try:
            logger.info("illustrations_step2_image_start", ill_id=ill_id,
                        image_type=image_type, aspect_ratio=aspect_ratio, prompt_len=len(prompt))
            image_url = await model_router.generate_image(prompt, aspect_ratio=aspect_ratio)
            elapsed = _time.monotonic() - t0
            logger.info("illustrations_step2_image_done", ill_id=ill_id, elapsed_s=round(elapsed, 1),
                        has_image=bool(image_url))
        except Exception as e:
            elapsed = _time.monotonic() - t0
            logger.error("illustrations_step2_image_failed", ill_id=ill_id,
                         elapsed_s=round(elapsed, 1), error=str(e)[:300])
            image_url = ""

        cleaned.append({
            "id": ill_id,
            "image_type": image_type,
            "style_id": raw.get("style_id", style_id),
            "aspect_ratio": aspect_ratio,
            "title": (raw.get("title") or f"配图 {idx}").strip(),
            "subtitle": (raw.get("subtitle") or "").strip(),
            "structure": (raw.get("structure") or "").strip(),
            "metaphor": (raw.get("metaphor") or "").strip(),
            "modules": raw.get("modules") or [],
            "elements": raw.get("elements") or [],
            "annotations": raw.get("annotations") or [],
            "character_action": (raw.get("character_action") or "").strip(),
            "bubble_text": (raw.get("bubble_text") or "").strip(),
            "bottom_conclusion": (raw.get("bottom_conclusion") or "").strip(),
            "prompt": prompt,
            "image_url": image_url,
        })

    logger.info("illustrations_done", model=model, style_id=style_id, count=len(cleaned))
    return {"illustrations": cleaned, "version": 2, "style_id": style_id}


# ── 全流程编排 ──────────────────────────────────────────────────────────

async def run_full_pipeline(
    raw_transcript: str,
    meeting_id: int,
    meeting_title: str = "",
    kb_docs: list[dict] | None = None,
    template_dict: dict | None = None,
    skip_polish: bool = False,
    term_hints: str = "",
) -> dict:
    """串行 + 并行编排:polish → (minutes ∥ requirements ∥ process_flows) → stakeholders。

    返回 {polished_transcript, meeting_minutes, requirements, process_flows, stakeholder_map}。
    任何一阶段失败不阻断后续(降级为空结果),由调用方在 DB 里反映 status。

    Args:
        skip_polish: 若为 True(如文本来源 asr_engine="text"),跳过润色，
                     直接将 raw_transcript 作为 polished 进入后续阶段。
        template_dict: 可选的活跃模板 dict，注入 minutes 生成 prompt。
    """
    logger.info("pipeline_start", meeting_id=meeting_id, in_chars=len(raw_transcript),
                skip_polish=skip_polish)

    # 记录各阶段失败(模型超时 / 403 / 429 / 解析失败等),调用方据此把 meeting 标 failed 供重试。
    stage_errors: list[str] = []

    # Step 1: 润色(文本来源可跳过)
    if skip_polish:
        logger.info("polish_skipped", meeting_id=meeting_id, reason="asr_engine=text")
        polished = raw_transcript
    else:
        try:
            polished = await polish_transcript(raw_transcript, term_hints)
        except Exception as e:
            logger.exception("polish_failed", error=str(e)[:200])
            polished = raw_transcript  # 失败时直接用原文
            stage_errors.append("polish")

    # Step 2 & 3: 纪要 + 需求 + 流程 并行
    minutes_task = asyncio.create_task(generate_minutes(polished, meeting_title, template_dict))
    reqs_task = asyncio.create_task(extract_requirements(polished))
    flows_task = asyncio.create_task(extract_process_flows(polished))
    minutes, requirements, process_flows = await asyncio.gather(
        minutes_task, reqs_task, flows_task, return_exceptions=True
    )
    if isinstance(minutes, Exception):
        logger.exception("minutes_failed", error=str(minutes)[:200])
        minutes = dict(_EMPTY_MINUTES)
        stage_errors.append("minutes")
    if isinstance(requirements, Exception):
        logger.exception("requirements_failed", error=str(requirements)[:200])
        requirements = []
        stage_errors.append("requirements")
    if isinstance(process_flows, Exception):
        logger.exception("process_flows_failed", error=str(process_flows)[:200])
        process_flows = dict(_EMPTY_PROCESS_FLOWS)
        stage_errors.append("process_flows")
    elif not isinstance(process_flows, dict):
        process_flows = dict(_EMPTY_PROCESS_FLOWS)

    # Step 4: 干系人(可选,失败不阻断)
    stakeholder_map: dict = dict(_EMPTY_STAKEHOLDERS)
    try:
        stakeholder_map = await extract_stakeholders(
            meeting_id=meeting_id,
            meeting_title=meeting_title,
            transcript=polished,
            minutes=minutes if isinstance(minutes, dict) else None,
            kb_docs=kb_docs,
        )
    except Exception as e:
        logger.exception("stakeholders_failed", error=str(e)[:200])
        stage_errors.append("stakeholders")

    logger.info(
        "pipeline_done",
        meeting_id=meeting_id,
        kp=len(minutes.get("key_points", [])) if isinstance(minutes, dict) else 0,
        reqs=len(requirements),
        flows=len(process_flows.get("flows", [])) if isinstance(process_flows, dict) else 0,
        stakeholders=len(stakeholder_map.get("stakeholders", [])),
        stage_errors=stage_errors,
    )
    return {
        "polished_transcript": polished,
        "meeting_minutes": minutes,
        "requirements": requirements,
        "process_flows": process_flows,
        "stakeholder_map": stakeholder_map,
        "stage_errors": stage_errors,
    }
