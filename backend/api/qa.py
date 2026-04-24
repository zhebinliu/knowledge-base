"""QA API: ask / ask-stream / doc generation / conversations / feedback / unanswered."""
import json
import time
import structlog
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, desc, func, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()

# 负反馈阈值：同一切片累计 👎 达到 N 次即自动入 review_queue
DOWN_VOTE_REVIEW_THRESHOLD = 2

from agents.kb_agent import answer_question, answer_question_stream, generate_doc
from models import get_session, async_session_maker
from models.chunk import Chunk
from models.qa_log import Conversation, QuestionLog, AnswerFeedback
from models.review_queue import ReviewQueue
from models.user import User
from services.auth import get_current_user, get_current_user_optional
from services.rate_limit import limiter

router = APIRouter()


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _is_refusal(answer: str) -> bool:
    """经验规则：模型拒答或给出空答案时，进未解决队列。"""
    if not answer or not answer.strip():
        return True
    markers = ["知识库中暂无相关内容", "没有相关内容", "无法回答", "请补充", "建议补充后再查询"]
    head = answer.strip()[:80]
    return any(m in head for m in markers)


# ── Schemas ──────────────────────────────────────────────────────────────────

class HistoryItem(BaseModel):
    role: str  # user / assistant
    content: str


class AskRequest(BaseModel):
    question: str
    ltc_stage: str | None = None
    industry: str | None = None
    history: list[HistoryItem] | None = None
    persona: str = "general"  # general | pm
    project_id: str | None = None
    conversation_id: str | None = None


class GenerateDocRequest(BaseModel):
    template: str
    project_name: str
    industry: str
    query: str | None = None


class FeedbackIn(BaseModel):
    question_log_id: str
    rating: str  # up / down / star
    comment: str | None = None


class ConversationIn(BaseModel):
    title: str | None = None
    persona: str = "general"
    project_id: str | None = None
    ltc_stage: str | None = None
    industry: str | None = None


class MessagePatchIn(BaseModel):
    messages: list[dict]
    title: str | None = None


# ── Ask ──────────────────────────────────────────────────────────────────────

async def _log_question(
    question: str, answer: str, sources: list[dict], model: str | None,
    persona: str, project_id: str | None,
    user_id: str | None, conversation_id: str | None,
    latency_ms: int,
) -> str:
    log = QuestionLog(
        conversation_id=conversation_id,
        user_id=user_id,
        question=question,
        answer_preview=(answer or "")[:500],
        source_chunk_ids=[s.get("id") for s in sources],
        model=model,
        persona=persona,
        project_id=project_id,
        unresolved=_is_refusal(answer),
        latency_ms=latency_ms,
    )
    async with async_session_maker() as session:
        session.add(log)
        await session.commit()
        return log.id


@router.post("/ask")
@limiter.limit("60/minute")
async def ask_question(
    request: Request,
    req: AskRequest,
    user: User | None = Depends(get_current_user_optional),
):
    t0 = time.time()
    history = [h.dict() for h in (req.history or [])]
    result = await answer_question(
        req.question,
        ltc_stage=req.ltc_stage,
        industry=req.industry,
        history=history,
        persona=req.persona,
        project_id=req.project_id,
    )
    latency_ms = int((time.time() - t0) * 1000)
    qlog_id = await _log_question(
        req.question, result.get("answer", ""), result.get("sources", []),
        result.get("model"),
        req.persona, req.project_id,
        user.id if user else None,
        req.conversation_id,
        latency_ms,
    )
    result["question_log_id"] = qlog_id
    return result


@router.post("/ask-stream")
@limiter.limit("60/minute")
async def ask_question_stream_endpoint(
    request: Request,
    req: AskRequest,
    user: User | None = Depends(get_current_user_optional),
):
    """SSE streaming endpoint. Events: data: {...}\n\n  Terminated with: data: [DONE]\n\n

    Extra final event: {"question_log_id": "..."} so client can bind feedback.
    """
    history = [h.dict() for h in (req.history or [])]
    user_id = user.id if user else None

    async def event_generator():
        t0 = time.time()
        collected_answer = []
        collected_sources: list[dict] = []
        model_used: str | None = None
        try:
            async for chunk in answer_question_stream(
                req.question,
                ltc_stage=req.ltc_stage,
                industry=req.industry,
                history=history,
                persona=req.persona,
                project_id=req.project_id,
            ):
                yield f"data: {chunk}\n\n"
                try:
                    obj = json.loads(chunk)
                    if "token" in obj:
                        collected_answer.append(obj["token"])
                    if "sources" in obj:
                        collected_sources = obj["sources"] or []
                        model_used = obj.get("model")
                except Exception:
                    pass
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            latency_ms = int((time.time() - t0) * 1000)
            try:
                qlog_id = await _log_question(
                    req.question, "".join(collected_answer), collected_sources, model_used,
                    req.persona, req.project_id, user_id, req.conversation_id, latency_ms,
                )
                yield f"data: {json.dumps({'question_log_id': qlog_id})}\n\n"
            except Exception:
                pass
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/generate-doc")
@limiter.limit("30/minute")
async def generate_document(request: Request, req: GenerateDocRequest):
    content = await generate_doc(req.template, req.project_name, req.industry, req.query)
    return {"content": content}


# ── Conversations ────────────────────────────────────────────────────────────

def _conv_dto(c: Conversation) -> dict:
    return {
        "id": c.id,
        "title": c.title,
        "persona": c.persona,
        "project_id": c.project_id,
        "ltc_stage": c.ltc_stage,
        "industry": c.industry,
        "messages": c.messages or [],
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


@router.get("/conversations")
async def list_conversations(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(desc(Conversation.updated_at))
        .limit(limit).offset(offset)
    )).scalars().all()
    return {"items": [_conv_dto(c) for c in rows]}


@router.post("/conversations")
async def create_conversation(
    body: ConversationIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    c = Conversation(
        user_id=user.id,
        title=(body.title or "新对话")[:200],
        persona=body.persona,
        project_id=body.project_id,
        ltc_stage=body.ltc_stage,
        industry=body.industry,
        messages=[],
    )
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return _conv_dto(c)


@router.get("/conversations/{conv_id}")
async def get_conversation(
    conv_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    c = await session.get(Conversation, conv_id)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "对话不存在")
    return _conv_dto(c)


@router.patch("/conversations/{conv_id}")
async def update_conversation(
    conv_id: str,
    body: MessagePatchIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    c = await session.get(Conversation, conv_id)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "对话不存在")
    c.messages = body.messages
    if body.title is not None:
        c.title = body.title[:200]
    await session.commit()
    await session.refresh(c)
    return _conv_dto(c)


@router.delete("/conversations/{conv_id}", status_code=204)
async def delete_conversation(
    conv_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    c = await session.get(Conversation, conv_id)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "对话不存在")
    await session.delete(c)
    await session.commit()


# ── Feedback ─────────────────────────────────────────────────────────────────

@router.post("/feedback")
async def submit_feedback(
    body: FeedbackIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if body.rating not in ("up", "down", "star"):
        raise HTTPException(400, "rating 必须是 up / down / star")
    qlog = await session.get(QuestionLog, body.question_log_id)
    if not qlog:
        raise HTTPException(404, "question_log 不存在")

    # 同一 (user, qlog) 只保留最新一条
    existing = (await session.execute(
        select(AnswerFeedback).where(
            AnswerFeedback.question_log_id == body.question_log_id,
            AnswerFeedback.user_id == user.id,
        )
    )).scalar_one_or_none()
    if existing:
        existing.rating = body.rating
        existing.comment = body.comment
    else:
        session.add(AnswerFeedback(
            question_log_id=body.question_log_id,
            user_id=user.id,
            rating=body.rating,
            comment=body.comment,
        ))

    # 点踩也进未解决队列
    if body.rating == "down" and not qlog.unresolved:
        qlog.unresolved = True
    # 点赞/收藏视为 resolved
    if body.rating in ("up", "star") and qlog.unresolved:
        qlog.unresolved = False
        qlog.resolved_at = _utcnow_naive()

    await session.commit()

    # 点踩 → 回溯到引用的切片，累加 down_votes；阈值达成入 review_queue
    if body.rating == "down":
        await _apply_down_vote_to_chunks(qlog.source_chunk_ids or [])

    return {"ok": True, "rating": body.rating}


async def _apply_down_vote_to_chunks(chunk_ids: list[str]) -> None:
    """每个被引用切片 down_votes +=1；若累计达阈值且尚未被驳回，入队复审（去重）。"""
    if not chunk_ids:
        return
    try:
        async with async_session_maker() as session:
            chunks = (await session.execute(
                select(Chunk).where(Chunk.id.in_(chunk_ids))
            )).scalars().all()
            triggered: list[Chunk] = []
            for c in chunks:
                c.down_votes = (c.down_votes or 0) + 1
                if (
                    c.down_votes >= DOWN_VOTE_REVIEW_THRESHOLD
                    and c.review_status != "rejected"
                ):
                    triggered.append(c)
            for c in triggered:
                # 已有 pending 的同切片负反馈条目 → 刷新 reason，避免重复入队
                existing = (await session.execute(
                    select(ReviewQueue).where(
                        ReviewQueue.chunk_id == c.id,
                        ReviewQueue.status == "pending",
                    )
                )).scalars().first()
                reason = f"用户反馈负面 ×{c.down_votes}"
                if existing:
                    existing.reason = reason
                else:
                    session.add(ReviewQueue(chunk_id=c.id, reason=reason))
            await session.commit()
    except Exception as e:
        logger.warning("down_vote_apply_failed", error=str(e)[:200])


# ── Unanswered queue ─────────────────────────────────────────────────────────

@router.get("/unanswered")
async def list_unanswered(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    total = (await session.execute(
        select(func.count()).select_from(QuestionLog).where(QuestionLog.unresolved == True)  # noqa: E712
    )).scalar_one()
    rows = (await session.execute(
        select(QuestionLog)
        .where(QuestionLog.unresolved == True)  # noqa: E712
        .order_by(desc(QuestionLog.created_at))
        .limit(limit).offset(offset)
    )).scalars().all()
    return {
        "total": total,
        "items": [
            {
                "id": r.id,
                "question": r.question,
                "answer_preview": r.answer_preview,
                "persona": r.persona,
                "project_id": r.project_id,
                "user_id": r.user_id,
                "created_at": r.created_at,
            } for r in rows
        ],
    }


@router.post("/unanswered/{qlog_id}/resolve")
async def resolve_unanswered(
    qlog_id: str,
    _user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    qlog = await session.get(QuestionLog, qlog_id)
    if not qlog:
        raise HTTPException(404, "记录不存在")
    qlog.unresolved = False
    qlog.resolved_at = _utcnow_naive()
    await session.commit()
    return {"ok": True}
