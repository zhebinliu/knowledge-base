"""会议调查问卷公开访问 API — 免登录(2026-07-16)。

通过 share_token 访问,参会者无需登录即可填写问卷和查看公开结果。
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.meeting_survey import MeetingSurvey, MeetingSurveyResponse

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────

class ResponseCreate(BaseModel):
    respondent_name: str = Field(..., min_length=1, max_length=100)
    selected_time_slots: list[int] = []        # time_poll: 时间槽 index 列表
    can_attend: Optional[bool] = None          # attendance
    satisfaction_answers: list[dict] = []      # satisfaction: [{question_id, score, text}]
    suggestion: Optional[str] = None


class SurveyPublicOut(BaseModel):
    id: int
    title: str
    description: str
    survey_type: str
    time_options: list[dict]
    meeting_time: Optional[str] = None
    meeting_location: Optional[str] = None
    satisfaction_questions: list[dict]
    status: str
    results_visible: bool


# ── Helpers ─────────────────────────────────────────────────────────────

def _to_public_out(s: MeetingSurvey) -> dict:
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
        "results_visible": s.results_visible,
    }


async def _load_by_token(db: AsyncSession, token: str) -> MeetingSurvey:
    result = await db.execute(
        select(MeetingSurvey).where(MeetingSurvey.share_token == token)
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "问卷不存在或已关闭")
    if s.status == "closed":
        raise HTTPException(400, "问卷已关闭")
    return s


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/survey/{share_token}", response_model=SurveyPublicOut)
async def get_public_survey(
    share_token: str,
    db: AsyncSession = Depends(get_session),
):
    """获取问卷信息(免登录)。"""
    s = await _load_by_token(db, share_token)
    return _to_public_out(s)


@router.post("/survey/{share_token}/respond", status_code=201)
async def submit_response(
    share_token: str,
    body: ResponseCreate,
    db: AsyncSession = Depends(get_session),
):
    """提交问卷回答(免登录)。"""
    s = await _load_by_token(db, share_token)

    # 同名去重检查
    existing = await db.execute(
        select(MeetingSurveyResponse).where(
            MeetingSurveyResponse.survey_id == s.id,
            MeetingSurveyResponse.respondent_name == body.respondent_name.strip(),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"已有人以「{body.respondent_name}」提交过,请换一个名字或联系组织者")

    resp = MeetingSurveyResponse(
        survey_id=s.id,
        respondent_name=body.respondent_name.strip(),
        selected_time_slots=body.selected_time_slots,
        can_attend=body.can_attend,
        satisfaction_answers=body.satisfaction_answers,
        suggestion=body.suggestion,
    )
    db.add(resp)
    await db.commit()
    return {"ok": True, "response_id": resp.id}


@router.get("/survey/{share_token}/results")
async def get_public_results(
    share_token: str,
    db: AsyncSession = Depends(get_session),
):
    """查看公开结果(需 results_visible=True)。"""
    s = await _load_by_token(db, share_token)
    if not s.results_visible:
        raise HTTPException(403, "结果未公开")

    responses_q = await db.execute(
        select(MeetingSurveyResponse).where(MeetingSurveyResponse.survey_id == s.id)
    )
    responses = responses_q.scalars().all()

    if s.survey_type == "time_poll":
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
        }
    elif s.survey_type == "attendance":
        attending = sum(1 for r in responses if r.can_attend is True)
        not_attending = sum(1 for r in responses if r.can_attend is False)
        return {
            "survey_type": "attendance",
            "total_responses": len(responses),
            "attending": attending,
            "not_attending": not_attending,
        }
    else:
        questions = s.satisfaction_questions or []
        question_stats = []
        for q in questions:
            scores = []
            for r in responses:
                for ans in (r.satisfaction_answers or []):
                    if ans.get("question_id") == q["id"] and isinstance(ans.get("score"), (int, float)):
                        scores.append(ans["score"])
            avg = round(sum(scores) / len(scores), 1) if scores else 0
            question_stats.append({
                "question": q["question"],
                "avg_score": avg,
                "response_count": len(scores),
            })
        return {
            "survey_type": "satisfaction",
            "total_responses": len(responses),
            "question_stats": question_stats,
        }
