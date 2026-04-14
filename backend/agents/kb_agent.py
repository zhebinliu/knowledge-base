"""
通用知识库 Agent
1. 问答模式（RAG）
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


async def answer_question(
    question: str,
    ltc_stage: str | None = None,
    industry: str | None = None,
) -> dict:
    # 1. Embedding
    query_vector = await embedding_service.embed(question)

    # 2. 向量检索
    raw_results = await vector_store.search(
        query_vector, top_k=RETRIEVAL_TOP_K, ltc_stage=ltc_stage, industry=industry
    )

    if not raw_results:
        return {"answer": "知识库中暂无相关内容。", "sources": []}

    # 3. Rerank
    documents = [r["payload"].get("content_preview", "") for r in raw_results]
    try:
        reranked_indices = await rerank_service.rerank(question, documents, top_n=RERANK_TOP_K)
        top_results = [raw_results[i] for i in reranked_indices]
    except Exception as e:
        logger.warning("rerank_failed", error=str(e), fallback="using_top_k")
        top_results = raw_results[:RERANK_TOP_K]

    # 4. 构建上下文
    chunks_for_prompt = [
        {
            "id": r["id"],
            "content": r["payload"].get("content_preview", ""),
            "ltc_stage": r["payload"].get("ltc_stage", ""),
        }
        for r in top_results
    ]

    # 5. 生成回答
    prompt = build_qa_prompt(question, chunks_for_prompt)
    answer = await model_router.chat_with_routing(
        "daily_qa",
        [{"role": "user", "content": prompt}],
        max_tokens=2000,
    )

    return {
        "answer": answer,
        "sources": [{"id": r["id"], "score": r["score"], "ltc_stage": r["payload"].get("ltc_stage")} for r in top_results],
    }


async def generate_doc(
    template: str,
    project_name: str,
    industry: str,
    query: str | None = None,
) -> str:
    search_query = query or f"{project_name} {industry} 实施方案"
    query_vector = await embedding_service.embed(search_query)
    raw_results = await vector_store.search(query_vector, top_k=RETRIEVAL_TOP_K)

    chunks = [{"id": r["id"], "content": r["payload"].get("content_preview", "")} for r in raw_results[:RERANK_TOP_K]]
    prompt = build_doc_generate_prompt(template, chunks, project_name, industry)

    return await model_router.chat_with_routing(
        "doc_generation",
        [{"role": "user", "content": prompt}],
        max_tokens=4000,
    )
