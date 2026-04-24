"""
文档挑战 Agent — 两阶段流式输出
Phase 1: 先出题（所有阶段的题目），前端立即展示问题列表
Phase 2: 逐题回答+评判，实时更新对应题目的结果
每个完成的问答会被固化为一条 chunk 写入知识库（tag=challenge）。
"""

import asyncio
import json
import re
import time
import uuid
import structlog
from services.model_router import model_router
from services.vector_store import vector_store
from services.embedding_service import embedding_service
from prompts.challenge import build_question_prompt, build_question_free_prompt, build_judge_prompt

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

    # 尝试 1：剥掉 <think> 后提取（正常情况：JSON 在 think 外面）
    no_think = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    no_think = re.sub(r"```(?:json)?|```", "", no_think).strip()
    found = _find_balanced(no_think)
    if found:
        try:
            json.loads(found)
            return found
        except json.JSONDecodeError:
            pass

    # 尝试 2：从原始文本直接提取（覆盖 JSON 全在 think 内的场景，如 GLM-5）
    raw_stripped_code = re.sub(r"```(?:json)?|```", "", text).strip()
    found = _find_balanced(raw_stripped_code)
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


DEDUP_SIMILARITY_THRESHOLD = 0.92


async def _check_duplicate(question: str) -> bool:
    """检查知识库中是否已存在高度相似的问题，避免重复写入。"""
    try:
        vec = await embedding_service.embed(question)
        results = await vector_store.search(vec, top_k=3)
        for r in results:
            if r["score"] >= DEDUP_SIMILARITY_THRESHOLD:
                preview = r["payload"].get("content_preview", "")
                if "## 问题" in preview:
                    logger.info("challenge_dedup_hit", score=r["score"], existing_id=r["id"])
                    return True
        return False
    except Exception as e:
        logger.warning("dedup_check_failed", error=str(e)[:100])
        return False


async def _persist_challenge_chunk(
    question: str,
    answer: str,
    reasoning: str,
    ltc_stage: str,
    decision: str,
    score: float,
    batch_id: str | None = None,
) -> tuple[str | None, str | None, str | None]:
    """
    把一道 challenge 的 Q+A+评分理由固化为 chunk，写入 Postgres + Qdrant。
    pass → auto_approved；其余 → needs_review 并入审核队列。
    仅 pass 且无重复时写入，保证知识库质量不被低质量内容稀释。
    返回 (chunk_id, review_status, review_id)；失败时返回 (None, None, None)。
    """
    from models import async_session_maker
    from models.document import Document
    from models.chunk import Chunk
    from models.review_queue import ReviewQueue
    from sqlalchemy import select, func

    passed = decision == "pass"
    review_status = "auto_approved" if passed else "needs_review"

    if passed and await _check_duplicate(question):
        logger.info("challenge_chunk_skipped_dedup", question=question[:60])
        return None, "skipped_duplicate", None

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
                batch_id=batch_id,
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


async def generate_questions(target_stage: str, chunks: list[dict], num_questions: int = 5) -> tuple[list[dict], str]:
    """Returns (questions_list, model_name)."""
    prompt = await build_question_prompt(target_stage, chunks, num_questions)
    result, used_model = await model_router.chat_with_routing(
        "challenge_questioning",
        [{"role": "user", "content": prompt}],
        max_tokens=8000,
        temperature=0.7,
        timeout=180.0,
    )
    found = _extract_json(result, target="array")
    if found:
        try:
            return json.loads(found), used_model
        except Exception:
            pass
    logger.warning("question_parse_failed", raw=result[:300])
    return [], used_model


async def generate_questions_free(target_stage: str, num_questions: int = 5) -> tuple[list[dict], str]:
    """自由出题：不依赖切片，纯靠 LLM 构造业务场景。Returns (questions_list, model_name)."""
    prompt = await build_question_free_prompt(target_stage, num_questions)
    result, used_model = await model_router.chat_with_routing(
        "challenge_questioning",
        [{"role": "user", "content": prompt}],
        max_tokens=8000,
        temperature=0.9,
        timeout=180.0,
    )
    found = _extract_json(result, target="array")
    if found:
        try:
            return json.loads(found), used_model
        except Exception:
            pass
    logger.warning("question_free_parse_failed", raw=result[:300])
    return [], used_model


async def judge_answer(question: str, answer: str, source_chunks: list[dict]) -> tuple[dict, str]:
    """Returns (judgment_dict, model_name)."""
    prompt = await build_judge_prompt(question, answer, source_chunks)
    result, used_model = await model_router.chat_with_routing(
        "challenge_judging",
        [{"role": "user", "content": prompt}],
        max_tokens=8000,
        temperature=0.1,
        timeout=180.0,
    )
    found = _extract_json(result, target="object")
    if found:
        try:
            parsed = json.loads(found)
            decision = parsed.get("decision", "")
            if decision in ("auto_accept", "accept"):
                parsed["decision"] = "pass"
            elif decision in ("reject",):
                parsed["decision"] = "fail"
            return parsed, used_model
        except Exception:
            pass

    score_match = re.search(r"overall[_\s]*score[:\s]*([0-9.]+)", result, re.IGNORECASE)
    if score_match:
        score = float(score_match.group(1))
        decision = "pass" if score >= 0.8 else "fail"
        reasoning_match = re.search(r"reasoning[:\s]*[\"']?(.+?)(?:[\"']?\s*[,}]|$)", result, re.IGNORECASE)
        reasoning_text = reasoning_match.group(1).strip() if reasoning_match else "从模型输出中提取"
        logger.info("judge_fallback_regex", score=score, decision=decision)
        return {"overall_score": score, "decision": decision, "reasoning": reasoning_text}, used_model

    logger.warning("judge_parse_failed", raw=result[:300])
    return {"overall_score": 0.5, "decision": "fail", "reasoning": "评分结果解析失败"}, used_model


async def run_challenge_stream(
    target_stages: list[str],
    questions_per_stage: int = 2,
    trigger_type: str = "manual",
    triggered_by: str | None = None,
    triggered_by_name: str | None = None,
    question_mode: str = "kb_based",
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

    一次完整流程会创建一条 ChallengeRun，结束时更新统计。
    """
    from agents.kb_agent import answer_question
    from datetime import datetime, timezone
    from models import async_session_maker
    from models.challenge_run import ChallengeRun

    batch_id = str(uuid.uuid4())  # 全长 UUID，作为 ChallengeRun.id

    # ── Run 入库（status=running）──────────────────────────────────────
    def _utcnow_naive():
        return datetime.now(timezone.utc).replace(tzinfo=None)

    try:
        async with async_session_maker() as session:
            run = ChallengeRun(
                id=batch_id,
                trigger_type=trigger_type,
                triggered_by=triggered_by,
                triggered_by_name=triggered_by_name,
                target_stages=list(target_stages),
                questions_per_stage=questions_per_stage,
                question_mode=question_mode,
                started_at=_utcnow_naive(),
                status="running",
            )
            session.add(run)
            await session.commit()
        yield {"type": "run_started", "batch_id": batch_id}
    except Exception as e:
        logger.warning("challenge_run_create_failed", error=str(e)[:200])

    total = 0
    passed = 0
    failed = 0
    run_status = "completed"
    run_error: str | None = None

    try:
        # ── Phase 1: Generate all questions ──────────────────────────────
        # kb_based: 并发处理所有阶段（检索 + 出题）
        # free_form: 直接让 LLM 自由出题，不检索
        pending: list[dict] = []   # {"stage","question","raw_results","question_model","question_gen_ms"}

        async def _gen_stage_kb(stage: str) -> dict:
            t0 = time.time()
            query_vector = await embedding_service.embed(f"{stage} 实施知识 CRM 业务流程")
            raw_results = await vector_store.search(query_vector, top_k=10, ltc_stage=stage)
            if not raw_results:
                raw_results = await vector_store.search(query_vector, top_k=10)
            chunks = [
                {"id": r["id"], "content": r["payload"].get("content_preview", ""), "ltc_stage": stage}
                for r in raw_results
            ]
            if not chunks:
                return {"stage": stage, "questions": [], "raw_results": [], "model": None, "gen_ms": 0, "reason": "no_chunks"}
            questions, model = await generate_questions(stage, chunks, questions_per_stage)
            gen_ms = int((time.time() - t0) * 1000)
            return {"stage": stage, "questions": questions, "raw_results": raw_results, "model": model, "gen_ms": gen_ms}

        async def _gen_stage_free(stage: str) -> dict:
            t0 = time.time()
            questions, model = await generate_questions_free(stage, questions_per_stage)
            gen_ms = int((time.time() - t0) * 1000)
            return {"stage": stage, "questions": questions, "raw_results": [], "model": model, "gen_ms": gen_ms}

        mode_label = "自由提问" if question_mode == "free_form" else "基于知识库"
        yield {"type": "status", "message": f"【{mode_label}】正在为 {len(target_stages)} 个阶段出题…"}

        stage_fn = _gen_stage_free if question_mode == "free_form" else _gen_stage_kb
        stage_results = await asyncio.gather(*[stage_fn(s) for s in target_stages], return_exceptions=True)

        q_index = 0
        for sr in stage_results:
            if isinstance(sr, Exception):
                logger.error("stage_gen_failed", error=str(sr))
                yield {"type": "status", "message": f"阶段出题失败：{str(sr)[:80]}"}
                continue
            stage = sr["stage"]
            if sr.get("reason") == "no_chunks":
                yield {"type": "status", "message": f"【{stage}】暂无知识内容，跳过"}
                continue
            if not sr["questions"]:
                yield {"type": "status", "message": f"【{stage}】题目生成失败，跳过"}
                continue

            for q_data in sr["questions"][:questions_per_stage]:
                question_text = q_data.get("question", "")
                if not question_text:
                    continue
                yield {
                    "type": "question",
                    "q_index": q_index,
                    "question": question_text,
                    "ltc_stage": stage,
                    "question_model": sr["model"],
                    "question_gen_ms": sr["gen_ms"],
                }
                pending.append({
                    "stage": stage,
                    "question": question_text,
                    "raw_results": sr["raw_results"],
                    "question_model": sr["model"],
                    "question_gen_ms": sr["gen_ms"],
                })
                q_index += 1
                total += 1

        # ── Phase 2: 并行作答+评判（Semaphore=3 限并发，避免打爆模型）──
        sem = asyncio.Semaphore(3)
        result_queue: asyncio.Queue = asyncio.Queue()

        async def _process_one(idx: int, item: dict):
            stage = item["stage"]
            question = item["question"]
            raw_results = item["raw_results"]
            async with sem:
                try:
                    t_ans = time.time()
                    answer_result = await answer_question(question, ltc_stage=None)
                    answer_ms = int((time.time() - t_ans) * 1000)
                    answer = answer_result["answer"]
                    answer_model = answer_result.get("model")
                    source_ids = [s["id"] for s in answer_result["sources"]]

                    if raw_results:
                        source_chunks = [
                            {"id": r["id"], "content": r["payload"].get("content_preview", "")}
                            for r in raw_results if r["id"] in source_ids
                        ] or [{"id": r["id"], "content": r["payload"].get("content_preview", "")} for r in raw_results[:3]]
                    else:
                        # free_form 模式：评判依据改用答案实际引用的切片
                        source_chunks = [{"id": s["id"], "content": s.get("content_preview", "")} for s in answer_result["sources"][:5]]

                    t_judge = time.time()
                    judgment, judge_model = await judge_answer(question, answer, source_chunks)
                    judge_ms = int((time.time() - t_judge) * 1000)
                except Exception as e:
                    logger.error("answer_or_judge_failed", idx=idx, error=str(e))
                    await result_queue.put({
                        "idx": idx, "error": True,
                        "answer": f"(作答失败：{e})",
                    })
                    return

                decision = judgment.get("decision", "pending_review")
                chunk_id, review_status, review_id = await _persist_challenge_chunk(
                    question=question,
                    answer=answer,
                    reasoning=judgment.get("reasoning", ""),
                    ltc_stage=stage,
                    decision=decision,
                    score=judgment.get("overall_score", 0),
                    batch_id=batch_id,
                )
                await result_queue.put({
                    "idx": idx,
                    "stage": stage,
                    "answer": answer,
                    "answer_model": answer_model,
                    "answer_ms": answer_ms,
                    "judge_model": judge_model,
                    "judge_ms": judge_ms,
                    "judgment": judgment,
                    "decision": decision,
                    "source_ids": source_ids,
                    "chunk_id": chunk_id,
                    "review_status": review_status,
                    "review_id": review_id,
                    "question_model": item.get("question_model"),
                })

        workers = [asyncio.create_task(_process_one(i, it)) for i, it in enumerate(pending)]
        remaining = len(pending)
        completed = 0
        while remaining > 0:
            payload = await result_queue.get()
            remaining -= 1
            completed += 1
            idx = payload["idx"]

            if payload.get("error"):
                failed += 1
                yield {
                    "type": "result",
                    "q_index": idx,
                    "answer": payload["answer"],
                    "score": 0,
                    "decision": "fail",
                    "reasoning": "",
                }
                continue

            decision = payload["decision"]
            if decision == "pass":
                passed += 1
            else:
                failed += 1

            yield {
                "type": "result",
                "q_index": idx,
                "batch_id": batch_id,
                "answer": payload["answer"],
                "score": payload["judgment"].get("overall_score", 0),
                "decision": decision,
                "reasoning": payload["judgment"].get("reasoning", ""),
                "source_chunk_ids": payload["source_ids"],
                "chunk_id": payload["chunk_id"],
                "review_status": payload["review_status"],
                "review_id": payload["review_id"],
                "question_model": payload.get("question_model"),
                "answer_model": payload["answer_model"],
                "judge_model": payload["judge_model"],
                "answer_ms": payload["answer_ms"],
                "judge_ms": payload["judge_ms"],
            }
            yield {"type": "status", "message": f"{completed}/{len(pending)} 道已完成"}

        for w in workers:
            if not w.done():
                await w
    except asyncio.CancelledError:
        run_status = "cancelled"
        run_error = "客户端取消（连接断开）"
        logger.warning("challenge_run_cancelled", batch_id=batch_id)
        # 取消未完成的 worker，避免泄漏
        for w in locals().get("workers", []) or []:
            if not w.done():
                w.cancel()
        raise
    except Exception as e:
        run_status = "failed"
        run_error = str(e)[:500]
        logger.error("challenge_run_failed", batch_id=batch_id, error=run_error)
        raise
    finally:
        # ── 更新 ChallengeRun 统计 + 状态（用 shield 防止 cancel 时丢更新）──
        async def _finalize():
            try:
                async with async_session_maker() as session:
                    run = await session.get(ChallengeRun, batch_id)
                    if run is not None:
                        run.finished_at = _utcnow_naive()
                        run.total = total
                        run.passed = passed
                        run.failed = failed
                        run.status = run_status
                        run.error_message = run_error
                        await session.commit()
            except Exception as e:
                logger.warning("challenge_run_update_failed", batch_id=batch_id, error=str(e)[:200])

        try:
            await asyncio.shield(_finalize())
        except asyncio.CancelledError:
            # shield 在被 cancel 时会重抛，但 _finalize 已开始独立完成
            pass


async def run_challenge_batch(
    target_stages: list[str],
    questions_per_stage: int = 2,
    question_mode: str = "kb_based",
) -> dict:
    """Non-streaming fallback — collects all events and returns full result."""
    batch_id = None
    questions: dict[int, dict] = {}
    results_map: dict[int, dict] = {}

    async for event in run_challenge_stream(target_stages, questions_per_stage, question_mode=question_mode):
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
