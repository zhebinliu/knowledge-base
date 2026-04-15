"""
文档挑战 Agent — 两阶段流式输出
Phase 1: 先出题（所有阶段的题目），前端立即展示问题列表
Phase 2: 逐题回答+评判，实时更新对应题目的结果
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


async def generate_questions(target_stage: str, chunks: list[dict]) -> list[dict]:
    prompt = build_question_prompt(target_stage, chunks)
    result = await model_router.chat_with_routing(
        "challenge_questioning",
        [{"role": "user", "content": prompt}],
        max_tokens=1500,
        temperature=0.7,
    )
    try:
        clean = re.sub(r"<think>.*?</think>", "", result, flags=re.DOTALL)
        clean = re.sub(r"```(?:json)?|```", "", clean).strip()
        m = re.search(r"\[.*\]", clean, re.DOTALL)
        clean = m.group(0) if m else clean
        return json.loads(clean)
    except Exception as e:
        logger.warning("question_parse_failed", error=str(e), raw=result[:200])
        return []


async def judge_answer(question: str, answer: str, source_chunks: list[dict]) -> dict:
    prompt = build_judge_prompt(question, answer, source_chunks)
    result = await model_router.chat_with_routing(
        "challenge_judging",
        [{"role": "user", "content": prompt}],
        max_tokens=800,
        temperature=0.1,
    )
    try:
        clean = re.sub(r"<think>.*?</think>", "", result, flags=re.DOTALL)
        clean = re.sub(r"```(?:json)?|```", "", clean).strip()
        m = re.search(r"\{.*\}", clean, re.DOTALL)
        clean = m.group(0) if m else clean
        return json.loads(clean)
    except Exception as e:
        logger.warning("judge_parse_failed", error=str(e), raw=result[:200])
        return {"overall_score": 0.5, "decision": "pending_review", "reasoning": "解析失败"}


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

        yield {
            "type": "result",
            "q_index": idx,
            "batch_id": batch_id,
            "answer": answer,
            "score": judgment.get("overall_score", 0),
            "decision": judgment.get("decision", "pending_review"),
            "reasoning": judgment.get("reasoning", ""),
            "source_chunk_ids": source_ids,
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
