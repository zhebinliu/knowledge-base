"""会议组织调查问卷 API — 管理端(2026-07-16)。

需要登录,按 owner_id 隔离。
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.meeting_survey import MeetingSurvey, MeetingSurveyResponse
from models.user import User
from services.auth import get_current_user
from services._time import utcnow_naive

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────

class TimeOption(BaseModel):
    start: str  # ISO datetime
    end: str
    label: str = ""


class SatisfactionQuestion(BaseModel):
    id: str
    question: str
    qtype: str = "score"  # score / text


class SurveyCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: str = ""
    survey_type: str = Field("time_poll", pattern="^(time_poll|attendance|satisfaction)$")
    time_options: list[TimeOption] = []
    meeting_time: Optional[str] = None
    meeting_location: Optional[str] = None
    satisfaction_questions: list[SatisfactionQuestion] = []
    project_id: Optional[str] = None
    results_visible: bool = False


class SurveyUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(open|closed|finalized)$")
    meeting_time: Optional[str] = None
    meeting_location: Optional[str] = None
    results_visible: Optional[bool] = None
    time_options: Optional[list[TimeOption]] = None          # 2026-07-17 修复:编辑弹窗会提交该字段但此前 schema 未定义,导致新时间段保存无效
    satisfaction_questions: Optional[list[SatisfactionQuestion]] = None  # 同上,满意度题目编辑无效的同样原因


class SurveyOut(BaseModel):
    id: int
    title: str
    description: str
    survey_type: str
    time_options: list[dict]
    meeting_time: Optional[str] = None
    meeting_location: Optional[str] = None
    satisfaction_questions: list[dict]
    status: str
    project_id: Optional[str] = None
    share_token: str
    results_visible: bool
    created_at: str
    updated_at: str
    response_count: int = 0


class FinalizeBody(BaseModel):
    meeting_time: str  # ISO datetime
    meeting_location: str = ""


# ── Helpers ─────────────────────────────────────────────────────────────

def _to_out(s: MeetingSurvey, response_count: int = 0) -> dict:
    return {
        "id": s.id,
        "title": s.title,
        "description": s.description or "",
        "survey_type": s.survey_type,
        "time_options": s.time_options or [],
        "meeting_time": s.meeting_time.isoformat() if s.meeting_time else None,
        "meeting_location": s.meeting_location,
        "satisfaction_questions": s.satisfaction_questions or [],
        "status": s.status,
        "project_id": s.project_id,
        "share_token": s.share_token,
        "results_visible": s.results_visible,
        "created_at": s.created_at.isoformat() if s.created_at else "",
        "updated_at": s.updated_at.isoformat() if s.updated_at else "",
        "response_count": response_count,
    }


async def _count_responses(db: AsyncSession, survey_id: int) -> int:
    r = await db.execute(
        select(func.count(MeetingSurveyResponse.id)).where(MeetingSurveyResponse.survey_id == survey_id)
    )
    return r.scalar() or 0


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("", response_model=list[SurveyOut])
async def list_surveys(
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MeetingSurvey)
        .where(MeetingSurvey.owner_id == user.id)
        .order_by(MeetingSurvey.created_at.desc())
    )
    surveys = result.scalars().all()
    out = []
    for s in surveys:
        cnt = await _count_responses(db, s.id)
        out.append(_to_out(s, cnt))
    return out


@router.post("", response_model=SurveyOut, status_code=201)
async def create_survey(
    body: SurveyCreate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    s = MeetingSurvey(
        owner_id=user.id,
        title=body.title,
        description=body.description,
        survey_type=body.survey_type,
        time_options=[t.model_dump() for t in body.time_options],
        meeting_time=datetime.fromisoformat(body.meeting_time) if body.meeting_time else None,
        meeting_location=body.meeting_location,
        satisfaction_questions=[q.model_dump() for q in body.satisfaction_questions],
        project_id=body.project_id,
        results_visible=body.results_visible,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _to_out(s, 0)


@router.get("/{survey_id}", response_model=SurveyOut)
async def get_survey(
    survey_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MeetingSurvey).where(
            MeetingSurvey.id == survey_id,
            MeetingSurvey.owner_id == user.id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "调查不存在")
    cnt = await _count_responses(db, survey_id)
    return _to_out(s, cnt)


@router.put("/{survey_id}", response_model=SurveyOut)
async def update_survey(
    survey_id: int,
    body: SurveyUpdate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MeetingSurvey).where(
            MeetingSurvey.id == survey_id,
            MeetingSurvey.owner_id == user.id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "调查不存在")
    if body.title is not None:
        s.title = body.title
    if body.description is not None:
        s.description = body.description
    if body.status is not None:
        s.status = body.status
    if body.meeting_time is not None:
        s.meeting_time = datetime.fromisoformat(body.meeting_time)
    if body.meeting_location is not None:
        s.meeting_location = body.meeting_location
    if body.results_visible is not None:
        s.results_visible = body.results_visible
    if body.time_options is not None:
        s.time_options = [t.model_dump() for t in body.time_options]
    if body.satisfaction_questions is not None:
        s.satisfaction_questions = [q.model_dump() for q in body.satisfaction_questions]
    await db.commit()
    await db.refresh(s)
    cnt = await _count_responses(db, survey_id)
    return _to_out(s, cnt)


@router.delete("/{survey_id}", status_code=200)
async def delete_survey(
    survey_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MeetingSurvey).where(
            MeetingSurvey.id == survey_id,
            MeetingSurvey.owner_id == user.id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "调查不存在")
    await db.delete(s)
    await db.commit()
    return {"ok": True}


@router.post("/{survey_id}/finalize", response_model=SurveyOut)
async def finalize_survey(
    survey_id: int,
    body: FinalizeBody,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """确定会议时间,从 time_poll 切换为 attendance 模式。"""
    result = await db.execute(
        select(MeetingSurvey).where(
            MeetingSurvey.id == survey_id,
            MeetingSurvey.owner_id == user.id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "调查不存在")
    if s.survey_type != "time_poll":
        raise HTTPException(400, "只有时间调查可以确定时间")
    s.meeting_time = datetime.fromisoformat(body.meeting_time)
    s.meeting_location = body.meeting_location or s.meeting_location
    s.survey_type = "attendance"
    s.status = "finalized"
    await db.commit()
    await db.refresh(s)
    cnt = await _count_responses(db, survey_id)
    return _to_out(s, cnt)


@router.post("/{survey_id}/switch-satisfaction", response_model=SurveyOut)
async def switch_to_satisfaction(
    survey_id: int,
    questions: list[SatisfactionQuestion],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """会议结束后切换为满意度问卷模式。"""
    result = await db.execute(
        select(MeetingSurvey).where(
            MeetingSurvey.id == survey_id,
            MeetingSurvey.owner_id == user.id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "调查不存在")
    if s.survey_type == "satisfaction":
        raise HTTPException(400, "已经是满意度模式")
    s.survey_type = "satisfaction"
    s.status = "open"
    s.satisfaction_questions = [q.model_dump() for q in questions]
    await db.commit()
    await db.refresh(s)
    cnt = await _count_responses(db, survey_id)
    return _to_out(s, cnt)


# ── 统计看板 ──────────────────────────────────────────────────────────────

@router.get("/{survey_id}/stats", response_model=dict)
async def get_survey_stats(
    survey_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """返回问卷统计数据(看板用)。"""
    result = await db.execute(
        select(MeetingSurvey).where(
            MeetingSurvey.id == survey_id,
            MeetingSurvey.owner_id == user.id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "调查不存在")

    responses_q = await db.execute(
        select(MeetingSurveyResponse).where(MeetingSurveyResponse.survey_id == survey_id)
    )
    responses = responses_q.scalars().all()

    if s.survey_type == "time_poll":
        # 每个时间槽的选择人数
        slot_counts = [0] * len(s.time_options or [])
        for r in responses:
            for idx in (r.selected_time_slots or []):
                if 0 <= idx < len(slot_counts):
                    slot_counts[idx] += 1
        return {
            "survey_type": "time_poll",
            "total_responses": len(responses),
            "time_options": s.time_options or [],
            "slot_counts": slot_counts,
            "best_slot_index": slot_counts.index(max(slot_counts)) if slot_counts else None,
            "responses": [
                {
                    "name": r.respondent_name,
                    "selected": r.selected_time_slots or [],
                    "created_at": r.created_at.isoformat() if r.created_at else "",
                }
                for r in responses
            ],
        }

    elif s.survey_type == "attendance":
        attending = sum(1 for r in responses if r.can_attend is True)
        not_attending = sum(1 for r in responses if r.can_attend is False)
        no_response = max(0, len(responses) - attending - not_attending)
        return {
            "survey_type": "attendance",
            "total_responses": len(responses),
            "attending": attending,
            "not_attending": not_attending,
            "no_response": no_response,
            "meeting_time": s.meeting_time.isoformat() if s.meeting_time else None,
            "meeting_location": s.meeting_location,
            "responses": [
                {
                    "name": r.respondent_name,
                    "can_attend": r.can_attend,
                    "created_at": r.created_at.isoformat() if r.created_at else "",
                }
                for r in responses
            ],
        }

    else:  # satisfaction
        questions = s.satisfaction_questions or []
        question_stats: list[dict[str, Any]] = []
        for q in questions:
            scores = []
            texts = []
            for r in responses:
                for ans in (r.satisfaction_answers or []):
                    if ans.get("question_id") == q["id"]:
                        if isinstance(ans.get("score"), (int, float)):
                            scores.append(ans["score"])
                        if ans.get("text"):
                            texts.append(ans["text"])
            avg = round(sum(scores) / len(scores), 1) if scores else 0
            question_stats.append({
                "id": q["id"],
                "question": q["question"],
                "qtype": q.get("qtype", "score"),
                "avg_score": avg,
                "response_count": len(scores),
                "texts": texts,
            })
        suggestions = [r.suggestion for r in responses if r.suggestion]
        return {
            "survey_type": "satisfaction",
            "total_responses": len(responses),
            "question_stats": question_stats,
            "suggestions": suggestions,
        }
