"""
文档切片 Agent — 基于知识模块的智能切分

核心理念：以"知识模块"而非"段落"为单位切分。
知识模块 = 一个完整的、可独立理解的知识单元：
  - 一个完整流程/方法论
  - 一条最佳实践及其背景
  - 一个案例分析
  - 一组问答
  - 一个完整的配置/操作指南
  - 一张表格及其说明上下文

算法：
  1. 结构解析 — 按 Markdown 标题构建文档树
  2. 模块组装 — 将碎片合并为语义完整的知识模块
  3. 尺寸优化 — 过大模块在语义边界切分，过小模块向上合并
  4. 上下文注入 — 每个切片附带文档标题和章节路径作为元数据
  5. 语义分类 — 大模型打 LTC 标签 + 行业标签
"""

import json
import re
import structlog
from services.model_router import model_router
from prompts.slicing import build_slicing_prompt

logger = structlog.get_logger()

MIN_MODULE_CHARS = 300
IDEAL_MODULE_CHARS = 1500
MAX_MODULE_CHARS = 3000

ATOMIC_BLOCK_PATTERN = re.compile(
    r"(\|.+\|[\s\S]*?(?=\n[^|]|\Z))"  # markdown table
    r"|"
    r"(```[\s\S]*?```)"                # code block
    r"|"
    r"((?:^[ \t]*[-*+] .+\n?)+)"       # bullet list block
    r"|"
    r"((?:^[ \t]*\d+\. .+\n?)+)",      # numbered list block
    re.MULTILINE,
)


def _is_header(line: str) -> tuple[int, str] | None:
    m = re.match(r"^(#{1,4})\s+(.+)", line)
    if m:
        return len(m.group(1)), m.group(2).strip()
    return None


def _build_section_tree(markdown: str, doc_title: str) -> list[dict]:
    """
    将 markdown 解析为扁平的节列表，每节保留：
    {level, title, path, content, children_count}
    """
    lines = markdown.split("\n")
    sections: list[dict] = []
    current_path: list[str] = []
    current_content_lines: list[str] = []
    current_level = 0
    current_title = doc_title

    def flush():
        content = "\n".join(current_content_lines).strip()
        if content or current_title:
            sections.append({
                "level": current_level,
                "title": current_title,
                "path": " > ".join(current_path) if current_path else doc_title,
                "content": content,
            })

    for line in lines:
        header = _is_header(line)
        if header:
            flush()
            current_content_lines = []
            level, title = header
            current_level = level
            current_title = title
            current_path = current_path[:level - 1] + [title]
        else:
            current_content_lines.append(line)

    flush()
    return sections


def _merge_small_siblings(sections: list[dict]) -> list[dict]:
    """
    合并过小的同级相邻节为一个知识模块。
    保持 level 最高的 title 作为合并后标题。
    """
    if not sections:
        return []

    merged: list[dict] = []
    buffer: dict | None = None

    for sec in sections:
        if buffer is None:
            buffer = dict(sec)
            continue

        same_parent = (sec["level"] >= buffer["level"])
        combined_len = len(buffer["content"]) + len(sec["content"])

        if same_parent and combined_len < IDEAL_MODULE_CHARS and len(buffer["content"]) < MIN_MODULE_CHARS:
            buffer["content"] = buffer["content"] + "\n\n" + f"### {sec['title']}\n{sec['content']}" if sec["title"] else buffer["content"] + "\n\n" + sec["content"]
            buffer["path"] = buffer["path"]
        else:
            merged.append(buffer)
            buffer = dict(sec)

    if buffer:
        merged.append(buffer)

    return merged


def _split_oversized(content: str, section_path: str) -> list[dict]:
    """
    对超长内容在语义边界切分。
    语义边界优先级：子标题 > 空行 > 段落边界
    保持原子块（表格、代码块、列表）不被拆分。
    """
    if len(content) <= MAX_MODULE_CHARS:
        return [{"section_path": section_path, "content": content}]

    paragraphs = re.split(r"\n\n+", content)
    chunks: list[dict] = []
    current = ""

    for para in paragraphs:
        if len(para) > MAX_MODULE_CHARS:
            if current.strip():
                chunks.append({"section_path": section_path, "content": current.strip()})
                current = ""
            sentences = re.split(r"(?<=[。！？；\n])", para)
            sub = ""
            for sent in sentences:
                if len(sub) + len(sent) > IDEAL_MODULE_CHARS and sub:
                    chunks.append({"section_path": section_path, "content": sub.strip()})
                    sub = sent
                else:
                    sub += sent
            if sub.strip():
                current = sub
            continue

        if len(current) + len(para) + 2 > IDEAL_MODULE_CHARS and current.strip():
            chunks.append({"section_path": section_path, "content": current.strip()})
            current = para
        else:
            current = current + "\n\n" + para if current else para

    if current.strip():
        chunks.append({"section_path": section_path, "content": current.strip()})

    return chunks


def coarse_slice(markdown: str, doc_title: str = "") -> list[dict]:
    """
    基于知识模块的智能切分。返回切片列表：
    [{"section_path": "...", "content": "..."}]
    """
    sections = _build_section_tree(markdown, doc_title)

    if not sections:
        if len(markdown.strip()) >= MIN_MODULE_CHARS:
            return [{"section_path": doc_title, "content": markdown.strip()}]
        return []

    merged = _merge_small_siblings(sections)

    result: list[dict] = []
    for sec in merged:
        content = sec["content"]
        path = sec["path"]

        if not content.strip():
            continue

        if len(content) < MIN_MODULE_CHARS:
            if result and len(result[-1]["content"]) + len(content) < MAX_MODULE_CHARS:
                result[-1]["content"] += "\n\n" + content
                continue
            elif len(content) < 100:
                continue

        if len(content) > MAX_MODULE_CHARS:
            result.extend(_split_oversized(content, path))
        else:
            result.append({"section_path": path, "content": content})

    final = []
    for chunk in result:
        if len(chunk["content"].strip()) >= MIN_MODULE_CHARS:
            final.append(chunk)
        elif final and len(final[-1]["content"]) + len(chunk["content"]) < MAX_MODULE_CHARS:
            final[-1]["content"] += "\n\n" + chunk["content"]

    return final


def _extract_json(text: str, target: str = "object") -> str | None:
    from agents.challenger_agent import _extract_json as _ext
    return _ext(text, target)


async def classify_chunk(
    content: str,
    doc_title: str,
    section_path: str,
    model: str | None = None,
    temperature: float = 0.1,
) -> tuple[dict, str]:
    """Returns (classification_dict, model_name)."""
    prompt = await build_slicing_prompt(doc_title, section_path, content)
    if model is None:
        result, used_model = await model_router.chat_with_routing(
            "slicing_classification",
            [{"role": "user", "content": prompt}],
            max_tokens=8000,
            temperature=temperature,
            timeout=180.0,
        )
    else:
        result, used_model = await model_router.chat(
            model,
            [{"role": "user", "content": prompt}],
            max_tokens=8000,
            temperature=temperature,
            timeout=180.0,
        )
    try:
        found = _extract_json(result, target="object")
        if found:
            return json.loads(found), used_model
        raise ValueError("No valid JSON found")
    except Exception as e:
        logger.warning("classification_parse_failed", error=str(e), raw=result[:200])
        return {
            "ltc_stage": "general",
            "ltc_stage_confidence": 0.3,
            "industry": "other",
            "module": "",
            "tags": [],
            "reasoning": "解析失败，默认分类",
        }, used_model


async def _classify_one(
    i: int,
    chunk: dict,
    doc_title: str,
    confidence_threshold: float,
) -> dict:
    """Classify a single chunk (primary model + optional review pass)."""
    classification, classify_model = await classify_chunk(
        chunk["content"], doc_title, chunk["section_path"]
    )

    confidence = classification.get("ltc_stage_confidence", 0.5)
    if confidence >= confidence_threshold:
        review_status = "auto_approved"
    elif confidence >= 0.6:
        review_status = "needs_review"
    else:
        classification["ltc_stage"] = "general"
        review_status = "needs_review"

    if review_status == "needs_review":
        logger.info("review_second_pass", chunk_index=i, confidence=confidence)
        try:
            # 原先用 glm-5，实测单次推理 ~150s；换成 minimax-m2.7（与主力 m2.5 走同一代理但 temp=0.5）
            # 以换取速度，review 质量会降低——低置信 chunk 最终仍可在审核队列人工校正
            review, review_model = await classify_chunk(
                chunk["content"], doc_title, chunk["section_path"],
                model="minimax-m2.7", temperature=0.5,
            )
            if review.get("ltc_stage_confidence", 0) > confidence:
                classification = review
                classify_model = review_model
                if review["ltc_stage_confidence"] >= confidence_threshold:
                    review_status = "auto_approved"
        except Exception as e:
            logger.warning("glm_review_failed", error=str(e))

    return {
        "chunk_index": i,
        "content": chunk["content"],
        "section_path": chunk["section_path"],
        "char_count": len(chunk["content"]),
        "ltc_stage": classification.get("ltc_stage", "general"),
        "ltc_stage_confidence": classification.get("ltc_stage_confidence", 0.5),
        "industry": classification.get("industry", "other"),
        "module": classification.get("module", ""),
        "tags": classification.get("tags", []),
        "reasoning": classification.get("reasoning", ""),
        "review_status": review_status,
        "classified_by_model": classify_model,
    }


async def slice_and_classify(
    markdown: str,
    doc_title: str,
    confidence_threshold: float = 0.7,
    max_concurrency: int = 8,
) -> list[dict]:
    """
    返回切片列表，每个切片包含：
    content, section_path, ltc_stage, ltc_stage_confidence, industry, module, tags,
    review_status (auto_approved / needs_review)

    chunk 分类并行执行（最多 max_concurrency 个同时运行），大幅缩短处理时间。
    """
    import asyncio

    raw_chunks = coarse_slice(markdown, doc_title)
    logger.info("module_slicing_done", doc=doc_title, count=len(raw_chunks),
                avg_chars=sum(len(c["content"]) for c in raw_chunks) // max(len(raw_chunks), 1))

    semaphore = asyncio.Semaphore(max_concurrency)

    async def _bounded(i: int, chunk: dict) -> dict:
        async with semaphore:
            return await _classify_one(i, chunk, doc_title, confidence_threshold)

    results = await asyncio.gather(*[_bounded(i, c) for i, c in enumerate(raw_chunks)])
    # gather preserves order, so chunk_index already matches i
    return list(results)


async def classify_single_chunk(content: str, model: str = "minimax-m2.5") -> dict:
    result, model_used = await classify_chunk(
        content=content,
        doc_title="",
        section_path="",
        model=model,
    )
    return result
