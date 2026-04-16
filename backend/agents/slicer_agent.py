"""
文档切片 Agent
Step 1：粗切（纯编程，按 Markdown 标题）
Step 2：语义分类 + 打标签（大模型）
"""

import json
import re
import structlog
from services.model_router import model_router
from prompts.slicing import build_slicing_prompt
from agents.challenger_agent import _extract_json

logger = structlog.get_logger()

MIN_CHARS = 200
MAX_CHARS = 2000
IDEAL_MAX = 1500


def coarse_slice(markdown: str, doc_title: str = "") -> list[dict]:
    """按 Markdown 标题切分，返回切片列表"""
    lines = markdown.split("\n")
    chunks = []
    current_path = []
    current_lines = []

    def flush(path: list[str], content_lines: list[str]):
        content = "\n".join(content_lines).strip()
        if len(content) >= MIN_CHARS:
            chunks.append({"section_path": " > ".join(path) or doc_title, "content": content})

    for line in lines:
        header_match = re.match(r"^(#{1,3})\s+(.+)", line)
        if header_match:
            if current_lines:
                flush(current_path, current_lines)
                current_lines = []
            level = len(header_match.group(1))
            title = header_match.group(2).strip()
            current_path = current_path[: level - 1] + [title]
        else:
            current_lines.append(line)

    if current_lines:
        flush(current_path, current_lines)

    # 过长切片二次切分（在段落边界）
    result = []
    for chunk in chunks:
        if len(chunk["content"]) <= MAX_CHARS:
            result.append(chunk)
        else:
            paragraphs = chunk["content"].split("\n\n")
            sub_content = ""
            for para in paragraphs:
                if len(sub_content) + len(para) > IDEAL_MAX and sub_content:
                    result.append({"section_path": chunk["section_path"], "content": sub_content.strip()})
                    sub_content = para
                else:
                    sub_content = sub_content + "\n\n" + para if sub_content else para
            if sub_content.strip():
                result.append({"section_path": chunk["section_path"], "content": sub_content.strip()})

    return result


async def classify_chunk(
    content: str,
    doc_title: str,
    section_path: str,
    model: str | None = None,
) -> dict:
    prompt = build_slicing_prompt(doc_title, section_path, content)
    if model is None:
        # 默认路径：走 routing（带跨上游 fallback）
        result = await model_router.chat_with_routing(
            "slicing_classification",
            [{"role": "user", "content": prompt}],
            max_tokens=8000,   # 推理模型需要充分思考空间
            temperature=0.1,
            timeout=180.0,
        )
    else:
        # 明确指定模型时（如 GLM 复审）直接调用
        result = await model_router.chat(
            model,
            [{"role": "user", "content": prompt}],
            max_tokens=8000,
            temperature=0.1,
            timeout=180.0,
        )
    try:
        # 健壮提取：先在原始文本中找 JSON（包括 <think> 内部），再剥掉 think 找
        found = _extract_json(result, target="object")
        if found:
            return json.loads(found)
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
        }


async def slice_and_classify(markdown: str, doc_title: str, confidence_threshold: float = 0.85) -> list[dict]:
    """
    返回切片列表，每个切片包含：
    content, section_path, ltc_stage, ltc_stage_confidence, industry, module, tags,
    review_status (auto_approved / needs_review)
    """
    raw_chunks = coarse_slice(markdown, doc_title)
    logger.info("coarse_slicing_done", doc=doc_title, count=len(raw_chunks))

    results = []
    for i, chunk in enumerate(raw_chunks):
        classification = await classify_chunk(chunk["content"], doc_title, chunk["section_path"])

        confidence = classification.get("ltc_stage_confidence", 0.5)
        if confidence >= confidence_threshold:
            review_status = "auto_approved"
        elif confidence >= 0.6:
            review_status = "needs_review"
        else:
            classification["ltc_stage"] = "general"
            review_status = "needs_review"

        # 低置信度用 GLM-5 复审
        if review_status == "needs_review":
            logger.info("review_with_glm", chunk_index=i, confidence=confidence)
            try:
                review = await classify_chunk(chunk["content"], doc_title, chunk["section_path"], model="glm-5")
                if review.get("ltc_stage_confidence", 0) > confidence:
                    classification = review
                    if review["ltc_stage_confidence"] >= confidence_threshold:
                        review_status = "auto_approved"
            except Exception as e:
                logger.warning("glm_review_failed", error=str(e))

        results.append({
            "chunk_index": i,
            "content": chunk["content"],
            "section_path": chunk["section_path"],
            "char_count": len(chunk["content"]),
            "ltc_stage": classification.get("ltc_stage", "general"),
            "ltc_stage_confidence": classification.get("ltc_stage_confidence", 0.5),
            "industry": classification.get("industry", "other"),
            "module": classification.get("module", ""),
            "tags": classification.get("tags", []),
            "review_status": review_status,
        })

    return results


async def classify_single_chunk(content: str, model: str = "minimax-m2.5") -> dict:
    """
    仅对单个切片内容进行分类，无需完整文档上下文。
    主要用于测试脚本（test_phase2.py）的准确率评测。

    Args:
        content: 切片文本内容
        model:   使用的模型名称（来自 MODEL_REGISTRY）

    Returns:
        {ltc_stage, ltc_stage_confidence, industry, module, tags, reasoning}
    """
    return await classify_chunk(
        content=content,
        doc_title="",
        section_path="",
        model=model,
    )
