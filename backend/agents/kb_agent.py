"""
通用知识库 Agent
1. 问答模式（RAG）— 多路召回 + Rerank + 上下文组装
2. 文档生成模式
3. 虚拟项目经理 persona — 项目维检索 + PM 视角回答
"""

import structlog
from datetime import datetime, timezone
from sqlalchemy import select, update
from services.model_router import model_router
from services.embedding_service import embedding_service
from services.rerank_service import rerank_service
from services.vector_store import vector_store
from prompts.qa import build_qa_prompt, build_pm_qa_prompt, build_doc_generate_prompt, build_history_messages
from models import async_session_maker
from models.chunk import Chunk
from models.document import Document
from models.project import Project

logger = structlog.get_logger()

RETRIEVAL_TOP_K = 20
RERANK_TOP_K = 5


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _fetch_full_contents(chunk_ids: list[str]) -> dict[str, str]:
    """从 PostgreSQL 批量取 chunk 完整内容，返回 {id: content}。"""
    if not chunk_ids:
        return {}
    async with async_session_maker() as session:
        rows = await session.execute(
            select(Chunk.id, Chunk.content).where(Chunk.id.in_(chunk_ids))
        )
        return {row.id: row.content for row in rows}


async def _fetch_chunk_section_map(chunk_ids: list[str]) -> dict[str, tuple[str, str]]:
    """批量取 chunk → (document_id, source_section)，供前端做引用跳转。"""
    if not chunk_ids:
        return {}
    async with async_session_maker() as session:
        rows = await session.execute(
            select(Chunk.id, Chunk.document_id, Chunk.source_section).where(Chunk.id.in_(chunk_ids))
        )
        return {r.id: (r.document_id, r.source_section or "") for r in rows}


async def _fetch_project_document_ids(project_id: str) -> list[str]:
    """取项目下所有已完成切片的文档 ID。"""
    async with async_session_maker() as session:
        rows = await session.execute(
            select(Document.id).where(Document.project_id == project_id)
        )
        return [r[0] for r in rows.all()]


async def _bump_citations(chunk_ids: list[str]):
    """异步自增 chunk 热度；不阻塞响应，失败不抛错。"""
    if not chunk_ids:
        return
    try:
        async with async_session_maker() as session:
            await session.execute(
                update(Chunk)
                .where(Chunk.id.in_(chunk_ids))
                .values(citation_count=Chunk.citation_count + 1, last_cited_at=_utcnow())
            )
            await session.commit()
    except Exception as e:
        logger.warning("citation_bump_failed", error=str(e)[:100])


async def _multi_route_retrieve(
    question: str,
    ltc_stage: str | None = None,
    industry: str | None = None,
    document_ids: list[str] | None = None,
) -> list[dict]:
    """
    多路召回策略：
    1. 精准检索（带 ltc_stage / industry 过滤）
    2. 宽泛检索（不带过滤，兜底）
    若 document_ids 给定（PM persona），两路都限定到该文档集合。
    去重后合并。
    """
    query_vector = await embedding_service.embed(question, use_cache=True)

    filtered_results = []
    if ltc_stage or industry:
        filtered_results = await vector_store.search(
            query_vector,
            top_k=RETRIEVAL_TOP_K,
            ltc_stage=ltc_stage,
            industry=industry,
            document_ids=document_ids,
        )

    broad_results = await vector_store.search(
        query_vector, top_k=RETRIEVAL_TOP_K, document_ids=document_ids
    )

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


def _sources_payload(top_results: list[dict], section_map: dict[str, tuple[str, str]]) -> list[dict]:
    out = []
    for r in top_results:
        doc_id, section = section_map.get(r["id"], ("", ""))
        out.append({
            "id": r["id"],
            "score": r["score"],
            "ltc_stage": r["payload"].get("ltc_stage"),
            "content": r["payload"].get("content_preview", ""),
            "document_id": doc_id or r["payload"].get("document_id", ""),
            "source_section": section,
        })
    return out


async def _resolve_pm_context(project_id: str) -> tuple[str, list[str]]:
    """PM persona 入口：返回 (project_name, document_ids)。"""
    async with async_session_maker() as session:
        proj = await session.get(Project, project_id)
        if not proj:
            return "", []
        rows = await session.execute(
            select(Document.id).where(Document.project_id == project_id)
        )
        return proj.name, [r[0] for r in rows.all()]


async def answer_question(
    question: str,
    ltc_stage: str | None = None,
    industry: str | None = None,
    history: list[dict] | None = None,
    persona: str = "general",
    project_id: str | None = None,
) -> dict:
    project_name = ""
    document_ids: list[str] | None = None
    if persona == "pm" and project_id:
        project_name, document_ids = await _resolve_pm_context(project_id)
        if not document_ids:
            name = project_name or project_id
            return {
                "answer": f"项目「{name}」下暂无已入库文档，无法以 PM 视角作答。",
                "sources": [], "model": None,
            }

    raw_results = await _multi_route_retrieve(question, ltc_stage, industry, document_ids)

    if not raw_results:
        return {"answer": "知识库中暂无相关内容。", "sources": [], "model": None}

    top_results = await _rerank_results(question, raw_results)
    chunk_ids = [r["id"] for r in top_results]
    full_contents = await _fetch_full_contents(chunk_ids)
    section_map = await _fetch_chunk_section_map(chunk_ids)

    chunks_for_prompt = [
        {
            "id": r["id"],
            "content": full_contents.get(r["id"]) or r["payload"].get("content_preview", ""),
            "ltc_stage": r["payload"].get("ltc_stage", ""),
        }
        for r in top_results
    ]

    if persona == "pm":
        prompt = await build_pm_qa_prompt(question, chunks_for_prompt, project_name)
    else:
        prompt = await build_qa_prompt(question, chunks_for_prompt)

    # 多轮上下文：前 N 轮作为真正的 user/assistant messages 放在当前 user 消息前
    messages = build_history_messages(history)
    messages.append({"role": "user", "content": prompt})

    # max_tokens 走 config_service 里 daily_qa 的默认值（8000），PM 结构化回答容易超 2000
    answer, used_model = await model_router.chat_with_routing(
        "daily_qa",
        messages,
    )

    # 命中时异步自增热度
    await _bump_citations(chunk_ids)

    return {
        "answer": answer,
        "model": used_model,
        "sources": _sources_payload(top_results, section_map),
    }


async def answer_question_stream(
    question: str,
    ltc_stage: str | None = None,
    industry: str | None = None,
    history: list[dict] | None = None,
    persona: str = "general",
    project_id: str | None = None,
):
    """
    Async generator yielding JSON-encoded SSE data strings:
      {"token": "..."}   — incremental answer text
      {"sources": [...]} — final source list (含 document_id / source_section)
    """
    import json as _json

    project_name = ""
    document_ids: list[str] | None = None
    if persona == "pm" and project_id:
        project_name, document_ids = await _resolve_pm_context(project_id)
        if not document_ids:
            name = project_name or project_id
            yield _json.dumps({"token": f"项目「{name}」下暂无已入库文档，无法以 PM 视角作答。"})
            yield _json.dumps({"sources": [], "model": None})
            return

    raw_results = await _multi_route_retrieve(question, ltc_stage, industry, document_ids)

    if not raw_results:
        yield _json.dumps({"token": "知识库中暂无相关内容。"})
        yield _json.dumps({"sources": [], "model": None})
        return

    top_results = await _rerank_results(question, raw_results)
    chunk_ids = [r["id"] for r in top_results]
    full_contents = await _fetch_full_contents(chunk_ids)
    section_map = await _fetch_chunk_section_map(chunk_ids)

    chunks_for_prompt = [
        {
            "id": r["id"],
            "content": full_contents.get(r["id"]) or r["payload"].get("content_preview", ""),
            "ltc_stage": r["payload"].get("ltc_stage", ""),
        }
        for r in top_results
    ]

    if persona == "pm":
        prompt = await build_pm_qa_prompt(question, chunks_for_prompt, project_name)
    else:
        prompt = await build_qa_prompt(question, chunks_for_prompt)

    messages = build_history_messages(history)
    messages.append({"role": "user", "content": prompt})

    in_think = False
    buf = ""
    used_model = None

    async for raw_token, model_name in model_router.chat_stream_with_routing(
        "daily_qa",
        messages,
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

    await _bump_citations(chunk_ids)

    yield _json.dumps({
        "sources": _sources_payload(top_results, section_map),
        "model": used_model,
    })


async def generate_doc(
    template: str,
    project_name: str,
    industry: str,
    query: str | None = None,
) -> str:
    search_query = query or f"{project_name} {industry} 实施方案"
    query_vector = await embedding_service.embed(search_query, use_cache=True)
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
