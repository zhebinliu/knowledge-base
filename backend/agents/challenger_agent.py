"""
文档挑战 Agent
运行模式：手动触发
调用方式：POST /api/challenge/run 或 python scripts/run_challenge.py
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
        max_tokens=1000,
        temperature=0.7,
    )
    try:
        clean = re.sub(r"```(?:json)?|```", "", result).strip()
        return json.loads(clean)
    except Exception as e:
        logger.warning("question_parse_failed", error=str(e))
        return []


async def judge_answer(question: str, answer: str, source_chunks: list[dict]) -> dict:
    prompt = build_judge_prompt(question, answer, source_chunks)
    result = await model_router.chat_with_routing(
        "challenge_judging",
        [{"role": "user", "content": prompt}],
        max_tokens=500,
        temperature=0.1,
    )
    try:
        clean = re.sub(r"```(?:json)?|```", "", result).strip()
        return json.loads(clean)
    except Exception as e:
        logger.warning("judge_parse_failed", error=str(e))
        return {"overall_score": 0.5, "decision": "pending_review", "reasoning": "解析失败"}


async def run_challenge_batch(
    target_stages: list[str],
    questions_per_stage: int = 5,
) -> dict:
    from agents.kb_agent import answer_question

    batch_id = str(uuid.uuid4())[:8]
    results = []

    for stage in target_stages:
        # 获取该阶段的切片作为出题素材
        query_vector = await embedding_service.embed(f"{stage} 知识库内容")
        raw_results = await vector_store.search(query_vector, top_k=10, ltc_stage=stage)
        chunks = [{"id": r["id"], "content": r["payload"].get("content_preview", ""), "ltc_stage": stage} for r in raw_results]

        if not chunks:
            logger.warning("no_chunks_for_stage", stage=stage)
            continue

        questions = await generate_questions(stage, chunks)
        logger.info("questions_generated", stage=stage, count=len(questions))

        for q_data in questions[:questions_per_stage]:
            question = q_data.get("question", "")
            if not question:
                continue

            # 用 KB Agent 回答
            answer_result = await answer_question(question, ltc_stage=stage)
            answer = answer_result["answer"]
            source_ids = [s["id"] for s in answer_result["sources"]]
            source_chunks = [{"id": r["id"], "content": r["payload"].get("content_preview", "")} for r in raw_results if r["id"] in source_ids]

            # 评判
            judgment = await judge_answer(question, answer, source_chunks)

            results.append({
                "batch_id": batch_id,
                "question": question,
                "ltc_stage": stage,
                "answer": answer,
                "score": judgment.get("overall_score", 0),
                "decision": judgment.get("decision", "pending_review"),
                "reasoning": judgment.get("reasoning", ""),
                "source_chunk_ids": source_ids,
            })

    return {"batch_id": batch_id, "results": results}
