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
    ILLUSTRATION_SYSTEM,
    ILLUSTRATION_USER,
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


# ── 阶段 1:润色 ─────────────────────────────────────────────────────────

async def polish_transcript(raw_transcript: str) -> str:
    """对 ASR 原始转写做语言润色。返回纯文本。"""
    if not raw_transcript or not raw_transcript.strip():
        return ""

    messages = [
        {"role": "system", "content": POLISH_SYSTEM},
        {"role": "user", "content": POLISH_USER.format(raw_transcript=raw_transcript)},
    ]
    content, model = await model_router.chat_with_routing(
        task="meeting_transcript_polish",
        messages=messages,
        temperature=0.2,
        max_tokens=16000,
    )
    logger.info("polish_done", model=model, in_chars=len(raw_transcript), out_chars=len(content))
    return content.strip()


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
    content, model = await model_router.chat_with_routing(
        task="meeting_requirements_extract",
        messages=messages,
        temperature=0.2,
        max_tokens=8000,
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
    """去掉 LLM 可能包裹的围栏,确保以 flowchart/graph 开头。

    2026-06-06:额外修复 Mermaid 保留字冲突——LLM 经常把 `end` 用作节点 ID
    (如 `end([结束])` / `f --> end`),但 `end` 在 Mermaid 语法里是保留关键字
    (subgraph 终止符),导致 Parse error。替换为 `node_end`。
    同理处理其他可能冲突的保留字(subgraph / click / style / classDef / class)。
    """
    import re as _re
    text = (raw or "").strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    if text.lower().startswith("mermaid"):
        text = text.split("\n", 1)[-1].strip()

    # 修复 Mermaid 保留字用作节点 ID 的问题:
    # 匹配行首或空白后的保留字 ID(后跟括号/方括号/花括号,或行中被引用如 `--> end`)
    _RESERVED = {"end", "subgraph", "click", "style", "classDef", "class", "direction"}
    for word in _RESERVED:
        safe = f"node_{word}"
        # 场景 1:节点定义 — `end([结束])` / `end[步骤]` / `end{判断?}`
        text = _re.sub(
            rf'(?<!\w){_re.escape(word)}(\d*)([\(\[\{{])',
            rf'{safe}\1\2',
            text,
        )
        # 场景 2:连线引用 — `f --> end` / `f -->|是| end`
        text = _re.sub(
            rf'(-->|--)\s*(?:\|[^\|]*\|)?\s*{_re.escape(word)}(?=\s*$)',
            rf'\1 {safe}',
            text,
        )
    return text


async def extract_process_flows(transcript: str) -> dict:
    """识别会议中的业务流程/工作流,返回 Mermaid 流程图列表。"""
    if not transcript or not transcript.strip():
        return dict(_EMPTY_PROCESS_FLOWS)

    messages = [
        {"role": "system", "content": PROCESS_FLOW_SYSTEM},
        {"role": "user", "content": PROCESS_FLOW_USER.format(transcript=transcript)},
    ]
    content, model = await model_router.chat_with_routing(
        task="meeting_process_flows_extract",
        messages=messages,
        temperature=0.2,
        max_tokens=8000,
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


async def extract_illustrations(transcript: str, minutes: dict | None = None) -> dict:
    """从会议内容提取认知锚点,为每个锚点生成手绘解释图。

    两步流程:
    1. LLM 分析会议内容 → 输出 4-8 张图的 prompt 列表
    2. 对每张图调用 MiniMax 图像生成 API → 返回 base64 图片
    """
    if not transcript or not transcript.strip():
        return dict(_EMPTY_ILLUSTRATIONS)

    # Step 1: LLM 分析 + 生成 prompt
    context = transcript[:30000]
    if minutes:
        summary = minutes.get("summary", "")
        if summary:
            context = f"会议摘要:{summary}\n\n{context}"

    messages = [
        {"role": "system", "content": ILLUSTRATION_SYSTEM},
        {"role": "user", "content": ILLUSTRATION_USER.format(transcript=context)},
    ]
    content, model = await model_router.chat_with_routing(
        task="meeting_illustrations_extract",
        messages=messages,
        temperature=0.4,
        max_tokens=8000,
        response_format={"type": "json_object"},
    )
    result = _safe_json_loads(content, dict(_EMPTY_ILLUSTRATIONS))
    if not isinstance(result, dict):
        result = dict(_EMPTY_ILLUSTRATIONS)
    items = result.get("illustrations", [])
    if not isinstance(items, list):
        items = []

    # Step 2: 逐张调用图像生成 API
    cleaned: list[dict] = []
    for idx, raw in enumerate(items, start=1):
        if not isinstance(raw, dict):
            continue
        prompt = (raw.get("prompt") or "").strip()
        if not prompt:
            continue

        # 尝试调用图像生成 API
        image_url = ""
        try:
            image_url = await model_router.generate_image(prompt)
        except Exception as e:
            logger.warning("illustration_image_failed", ill_id=raw.get("id"), error=str(e)[:200])
            # 图像生成失败时仍保留元数据,前端可显示 prompt 让用户手动生成
            image_url = ""

        cleaned.append({
            "id": raw.get("id") or f"ILL-{idx:03d}",
            "title": (raw.get("title") or f"解释图 {idx}").strip(),
            "theme": (raw.get("theme") or "").strip(),
            "structure_type": (raw.get("structure_type") or "concept_metaphor").strip(),
            "core_idea": (raw.get("core_idea") or "").strip(),
            "composition": (raw.get("composition") or "").strip(),
            "elements": raw.get("elements") or [],
            "annotations": raw.get("annotations") or [],
            "prompt": prompt,
            "image_url": image_url,
        })

    logger.info("illustrations_done", model=model, count=len(cleaned))
    return {"illustrations": cleaned, "version": 1}


# ── 全流程编排 ──────────────────────────────────────────────────────────

async def run_full_pipeline(
    raw_transcript: str,
    meeting_id: int,
    meeting_title: str = "",
    kb_docs: list[dict] | None = None,
    template_dict: dict | None = None,
    skip_polish: bool = False,
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
            polished = await polish_transcript(raw_transcript)
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
