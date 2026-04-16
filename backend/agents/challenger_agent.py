"""
文档挑战 Agent — 两阶段流式输出
Phase 1: 先出题（所有阶段的题目），前端立即展示问题列表
Phase 2: 逐题回答+评判，实时更新对应题目的结果
每个完成的问答会被固化为一条 chunk 写入知识库（tag=challenge）。
"""

import json
import re
import uuid
import structlog
from services.model_router import model_router
from services.vector_store import vector_store
from services.embedding_service import embedding_service
from prompts.challenge import build_question_prompt, build_judge_prompt

logger = structlog.get_logger()


def _extract_json(text: str, target: str = "object") -> str | None:
    """
    从 LLM 原始输出中健壮地提取 JSON object / array。
    1. 先在原始文本中找（覆盖 GLM-5 把 JSON 放在 <think> 里的情况）
    2. 再剥掉 <think> 和代码块后找
    target: "object" 找 {}, "array" 找 []
    """
    open_ch, close_ch = ('{', '}') if target == "object" else ('[', ']')

    def _find_balanced(s: str) -> str | None:
        start = s.find(open_ch)
        if start == -1:
            return None
        depth = 0
        in_str = False
        escape = False
        for i in range(start, len(s)):
            c = s[i]
            if escape:
                escape = False
                continue
            if c == '\\':
                escape = True
                continue
            if c == '"':
                in_str = not in_str
                continue
            if in_str:
                continue
            if c == open_ch:
                depth += 1
            elif c == close_ch:
                depth -= 1
                if depth == 0:
                    return s[start:i + 1]
        return None

    # 尝试 1：从原始文本直接提取（覆盖 think 内含 JSON 的场景）
    raw_stripped_code = re.sub(r"```(?:json)?|```", "", text).strip()
    found = _find_balanced(raw_stripped_code)
    if found:
        try:
            json.loads(found)
            return found
        except json.JSONDecodeError:
            pass

    # 尝试 2：剥掉 <think> 后再提取
    no_think = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    no_think = re.sub(r"```(?:json)?|```", "", no_think).strip()
    found = _find_balanced(no_think)
    if found:
        try:
            json.loads(found)
            return found
        except json.JSONDecodeError:
            pass

    return None

# 所有知识挑战产物都挂到这条虚拟文档下，便于 Documents 列表里单独浏览
VIRTUAL_CHALLENGE_DOC_ID = "00000000-0000-0000-0000-000000000001"
VIRTUAL_CHALLENGE_FILENAME = "知识挑战"


async def _persist_challenge_chunk(
    question: str,
    answer: str,
    reasoning: str,
    ltc_stage: str,
    decision: str,
    score: float,
) -> tuple[str | None, str | None, str | None]:
    """
    把一道 challenge 的 Q+A+评分理由固化为 chunk，写入 Postgres + Qdrant。
    pass → auto_approved；其余 → needs_review 并入审核队列。
    返回 (chunk_id, review_status, review_id)；失败时返回 (None, None, None)。
    """
    from models import async_session_maker
    from models.document import Document
    from models.chunk import Chunk
    from models.review_queue import ReviewQueue
    from sqlalchemy import select, func

    passed = decision == "pass"
    review_status = "auto_approved" if passed else "needs_review"
    content_parts = [f"## 问题\n{question}", f"## 答案\n{answer}"]
    if reasoning:
        content_parts.append(f"## 评分理由\n{reasoning}")
    content = "\n\n".join(content_parts)

    try:
        async with async_session_maker() as session:
            # 幂等创建挑战虚拟文档
            doc = await session.get(Document, VIRTUAL_CHALLENGE_DOC_ID)
            if doc is None:
                doc = Document(
                    id=VIRTUAL_CHALLENGE_DOC_ID,
                    filename=VIRTUAL_CHALLENGE_FILENAME,
                    original_format="challenge",
                    conversion_status="completed",
                )
                session.add(doc)
                await session.flush()

            # 用已有 challenge chunk 数量作为 chunk_index，保证单调
            chunk_count = await session.scalar(
                select(func.count())
                .select_from(Chunk)
                .where(Chunk.document_id == VIRTUAL_CHALLENGE_DOC_ID)
            ) or 0

            chunk = Chunk(
                document_id=VIRTUAL_CHALLENGE_DOC_ID,
                content=content,
                chunk_index=chunk_count,
                ltc_stage=ltc_stage,
                ltc_stage_confidence=float(score) if score is not None else None,
                industry=None,
                module=None,
                tags=["challenge", "q-pass" if passed else "q-fail"],
                source_section="知识挑战",
                char_count=len(content),
                review_status=review_status,
            )
            session.add(chunk)
            await session.flush()

            # 向量化 + 入 Qdrant
            try:
                vector = await embedding_service.embed(content)
                await vector_store.upsert(
                    chunk.id,
                    vector,
                    {
                        "chunk_id": chunk.id,
                        "document_id": VIRTUAL_CHALLENGE_DOC_ID,
                        "ltc_stage": ltc_stage,
                        "industry": None,
                        "content_preview": content[:200],
                    },
                )
                chunk.vector_id = chunk.id
            except Exception as ve:
                logger.warning("challenge_embed_failed", error=str(ve)[:200])

            review_id: str | None = None
            if review_status == "needs_review":
                review_item = ReviewQueue(
                    chunk_id=chunk.id,
                    reason=f"知识挑战 · 评分 {float(score):.2f}" if score is not None else "知识挑战",
                )
                session.add(review_item)
                await session.flush()
                review_id = review_item.id

            await session.commit()
            return chunk.id, review_status, review_id
    except Exception as e:
        logger.warning("persist_challenge_chunk_failed", error=str(e)[:200])
        return None, None, None


async def generate_questions(target_stage: str, chunks: list[dict]) -> list[dict]:
    prompt = build_question_prompt(target_stage, chunks)
    result = await model_router.chat_with_routing(
        "challenge_questioning",
        [{"role": "user", "content": prompt}],
        max_tokens=1500,
        temperature=0.7,
    )
    found = _extract_json(result, target="array")
    if found:
        try:
            return json.loads(found)
        except Exception:
            pass
    logger.warning("question_parse_failed", raw=result[:300])
    return []


async def judge_answer(question: str, answer: str, source_chunks: list[dict]) -> dict:
    prompt = build_judge_prompt(question, answer, source_chunks)
    result = await model_router.chat_with_routing(
        "challenge_judging",
        [{"role": "user", "content": prompt}],
        max_tokens=800,
        temperature=0.1,
    )
    found = _extract_json(result, target="object")
    if found:
        try:
            parsed = json.loads(found)
            # 标准化 decision 值
            decision = parsed.get("decision", "")
            if decision in ("auto_accept", "accept"):
                parsed["decision"] = "pass"
            elif decision in ("reject",):
                parsed["decision"] = "fail"
            return parsed
        except Exception:
            pass
    logger.warning("judge_parse_failed", raw=result[:300])
    return {"overall_score": 0.5, "decision": "fail", "reasoning": "评分结果解析失败"}


async def run_challenge_stream(
    target_stages: list[str],
    questions_per_stage: int = 2,
):
    """
    Two-phase async generator:

    Phase 1 — question events (one per question, emitted as soon as a stage is done):
      {"type": "question", "q_index": N, "question": "...", "ltc_stage": "..."}

    Phase 2 — result events (one per question, emitted after answer+judge):
      {"type": "result", "q_index": N, "answer": "...", "score": 0.8,
       "decision": "pass", "reasoning": "..."}

    Progress events:
      {"type": "status", "message": "..."}
    """
    from agents.kb_agent import answer_question

    batch_id = str(uuid.uuid4())[:8]

    # ── Phase 1: Generate all questions ──────────────────────────────
    # Store (stage, question_text, raw_results) for Phase 2
    pending: list[dict] = []   # {"stage", "question", "raw_results"}
    q_index = 0

    for stage in target_stages:
        yield {"type": "status", "message": f"正在为【{stage}】检索知识并出题…"}

        query_vector = await embedding_service.embed(f"{stage} 实施知识 CRM 业务流程")
        raw_results = await vector_store.search(query_vector, top_k=10, ltc_stage=stage)
        if not raw_results:
            raw_results = await vector_store.search(query_vector, top_k=10)

        chunks = [
            {"id": r["id"], "content": r["payload"].get("content_preview", ""), "ltc_stage": stage}
            for r in raw_results
        ]

        if not chunks:
            yield {"type": "status", "message": f"【{stage}】暂无知识内容，跳过"}
            continue

        questions = await generate_questions(stage, chunks)
        if not questions:
            yield {"type": "status", "message": f"【{stage}】题目生成失败，跳过"}
            continue

        for q_data in questions[:questions_per_stage]:
            question_text = q_data.get("question", "")
            if not question_text:
                continue

            # Emit the question immediately so frontend can show it
            yield {
                "type": "question",
                "q_index": q_index,
                "question": question_text,
                "ltc_stage": stage,
            }
            pending.append({"stage": stage, "question": question_text, "raw_results": raw_results})
            q_index += 1

    # ── Phase 2: Answer & judge each question ─────────────────────────
    for idx, item in enumerate(pending):
        stage    = item["stage"]
        question = item["question"]
        raw_results = item["raw_results"]

        yield {"type": "status", "message": f"第 {idx + 1}/{len(pending)} 题：正在作答和评判…"}

        try:
            answer_result = await answer_question(question, ltc_stage=None)
            answer    = answer_result["answer"]
            source_ids = [s["id"] for s in answer_result["sources"]]
            source_chunks = [
                {"id": r["id"], "content": r["payload"].get("content_preview", "")}
                for r in raw_results if r["id"] in source_ids
            ] or [{"id": r["id"], "content": r["payload"].get("content_preview", "")} for r in raw_results[:3]]

            judgment = await judge_answer(question, answer, source_chunks)
        except Exception as e:
            logger.error("answer_or_judge_failed", idx=idx, error=str(e))
            yield {
                "type": "result",
                "q_index": idx,
                "answer": f"（作答失败：{e}）",
                "score": 0,
                "decision": "fail",
                "reasoning": "",
            }
            continue

        # 固化为知识库 chunk（含 review_queue 记录），失败不阻塞事件流
        chunk_id, review_status, review_id = await _persist_challenge_chunk(
            question=question,
            answer=answer,
            reasoning=judgment.get("reasoning", ""),
            ltc_stage=stage,
            decision=judgment.get("decision", "pending_review"),
            score=judgment.get("overall_score", 0),
        )

        yield {
            "type": "result",
            "q_index": idx,
            "batch_id": batch_id,
            "answer": answer,
            "score": judgment.get("overall_score", 0),
            "decision": judgment.get("decision", "pending_review"),
            "reasoning": judgment.get("reasoning", ""),
            "source_chunk_ids": source_ids,
            "chunk_id": chunk_id,
            "review_status": review_status,
            "review_id": review_id,
        }


async def run_challenge_batch(
    target_stages: list[str],
    questions_per_stage: int = 2,
) -> dict:
    """Non-streaming fallback — collects all events and returns full result."""
    batch_id = None
    questions: dict[int, dict] = {}
    results_map: dict[int, dict] = {}

    async for event in run_challenge_stream(target_stages, questions_per_stage):
        if event.get("type") == "question":
            i = event["q_index"]
            questions[i] = {"question": event["question"], "ltc_stage": event["ltc_stage"]}
        elif event.get("type") == "result":
            i = event["q_index"]
            batch_id = event.get("batch_id", batch_id)
            results_map[i] = event

    results = []
    for i in sorted(questions.keys()):
        q = questions[i]
        r = results_map.get(i, {})
        results.append({
            "batch_id": batch_id or "unknown",
            "question": q["question"],
            "ltc_stage": q["ltc_stage"],
            "answer": r.get("answer", ""),
            "score": r.get("score", 0),
            "decision": r.get("decision", "pending_review"),
            "reasoning": r.get("reasoning", ""),
        })

    return {"batch_id": batch_id or str(uuid.uuid4())[:8], "results": results}
