"""
通用知识库 Agent
1. 问答模式（RAG）— 多路召回 + Rerank + 上下文组装
2. 文档生成模式
"""

import structlog
from services.model_router import model_router
from services.embedding_service import embedding_service
from services.rerank_service import rerank_service
from services.vector_store import vector_store
from prompts.qa import build_qa_prompt, build_doc_generate_prompt

logger = structlog.get_logger()

RETRIEVAL_TOP_K = 20
RERANK_TOP_K = 5


async def _multi_route_retrieve(
    question: str,
    ltc_stage: str | None = None,
    industry: str | None = None,
) -> list[dict]:
    """
    多路召回策略：
    1. 精准检索（带 ltc_stage / industry 过滤）
    2. 宽泛检索（不带过滤，兜底）
    去重后合并，确保不遗漏跨阶段的关联知识。
    """
    query_vector = await embedding_service.embed(question)

    filtered_results = []
    if ltc_stage or industry:
        filtered_results = await vector_store.search(
            query_vector, top_k=RETRIEVAL_TOP_K, ltc_stage=ltc_stage, industry=industry
        )

    broad_results = await vector_store.search(query_vector, top_k=RETRIEVAL_TOP_K)

    seen_ids = set()
    merged = []
    for r in filtered_results + broad_results:
        if r["id"] not in seen_ids:
            seen_ids.add(r["id"])
            merged.append(r)

    return merged


async def _rerank_results(question: str, raw_results: list[dict]) -> list[dict]:
    """Rerank 并返回 top 结果，失败时回退到向量分数排序。"""
    documents = [r["payload"].get("content_preview", "") for r in raw_results]
    try:
        reranked_indices = await rerank_service.rerank(question, documents, top_n=RERANK_TOP_K)
        return [raw_results[i] for i in reranked_indices]
    except Exception as e:
        logger.warning("rerank_failed", error=str(e), fallback="vector_score_top_k")
        return sorted(raw_results, key=lambda x: x["score"], reverse=True)[:RERANK_TOP_K]


async def answer_question(
    question: str,
    ltc_stage: str | None = None,
    industry: str | None = None,
) -> dict:
    raw_results = await _multi_route_retrieve(question, ltc_stage, industry)

    if not raw_results:
        return {"answer": "知识库中暂无相关内容。", "sources": [], "model": None}

    top_results = await _rerank_results(question, raw_results)

    chunks_for_prompt = [
        {
            "id": r["id"],
            "content": r["payload"].get("content_preview", ""),
            "ltc_stage": r["payload"].get("ltc_stage", ""),
        }
        for r in top_results
    ]

    prompt = await build_qa_prompt(question, chunks_for_prompt)
    answer, used_model = await model_router.chat_with_routing(
        "daily_qa",
        [{"role": "user", "content": prompt}],
        max_tokens=2000,
    )

    return {
        "answer": answer,
        "model": used_model,
        "sources": [{"id": r["id"], "score": r["score"], "ltc_stage": r["payload"].get("ltc_stage")} for r in top_results],
    }


async def answer_question_stream(
    question: str,
    ltc_stage: str | None = None,
    industry: str | None = None,
):
    """
    Async generator yielding JSON-encoded SSE data strings:
      {"token": "..."}   — incremental answer text
      {"sources": [...]} — final source list
    """
    import json as _json

    raw_results = await _multi_route_retrieve(question, ltc_stage, industry)

    if not raw_results:
        yield _json.dumps({"token": "知识库中暂无相关内容。"})
        yield _json.dumps({"sources": [], "model": None})
        return

    top_results = await _rerank_results(question, raw_results)

    chunks_for_prompt = [
        {
            "id": r["id"],
            "content": r["payload"].get("content_preview", ""),
            "ltc_stage": r["payload"].get("ltc_stage", ""),
        }
        for r in top_results
    ]

    prompt = await build_qa_prompt(question, chunks_for_prompt)

    in_think = False
    buf = ""
    used_model = None

    async for raw_token, model_name in model_router.chat_stream_with_routing(
        "daily_qa",
        [{"role": "user", "content": prompt}],
        max_tokens=2000,
    ):
        if raw_token is None:
            used_model = model_name
            continue

        buf += raw_token

        if in_think:
            end_idx = buf.find("</think>")
            if end_idx != -1:
                buf = buf[end_idx + 8:]
                in_think = False
            else:
                buf = buf[-15:]
        else:
            start_idx = buf.find("<think>")
            if start_idx != -1:
                visible = buf[:start_idx]
                if visible:
                    yield _json.dumps({"token": visible})
                buf = buf[start_idx + 7:]
                in_think = True
            else:
                safe_len = max(0, len(buf) - 8)
                if safe_len > 0:
                    yield _json.dumps({"token": buf[:safe_len]})
                    buf = buf[safe_len:]

    if buf and not in_think:
        yield _json.dumps({"token": buf})

    sources = [
        {"id": r["id"], "score": r["score"], "ltc_stage": r["payload"].get("ltc_stage")}
        for r in top_results
    ]
    yield _json.dumps({"sources": sources, "model": used_model})


async def generate_doc(
    template: str,
    project_name: str,
    industry: str,
    query: str | None = None,
) -> str:
    search_query = query or f"{project_name} {industry} 实施方案"
    query_vector = await embedding_service.embed(search_query)
    raw_results = await vector_store.search(query_vector, top_k=RETRIEVAL_TOP_K)

    top_results = await _rerank_results(search_query, raw_results)

    chunks = [{"id": r["id"], "content": r["payload"].get("content_preview", "")} for r in top_results]
    prompt = await build_doc_generate_prompt(template, chunks, project_name, industry)

    content, used_model = await model_router.chat_with_routing(
        "doc_generation",
        [{"role": "user", "content": prompt}],
        max_tokens=4000,
    )
    return content
