"""访谈式产出：kickoff_pptx / insight 生成前的一问一答接口。"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from models import get_session
from models.project import Project
from models.project_interview import ProjectInterviewAnswer
from models.skill import Skill
from models.agent_config import AgentConfig

logger = structlog.get_logger()

router = APIRouter()

INTERVIEW_KINDS = ("kickoff_pptx", "insight")


async def _get_agent_skill_ids(session: AsyncSession, kind: str) -> list[str]:
    row = (await session.execute(
        select(AgentConfig).where(
            AgentConfig.config_type == "output_agent",
            AgentConfig.config_key == kind,
        )
    )).scalar_one_or_none()
    if row and isinstance(row.config_value, dict):
        return row.config_value.get("skill_ids") or []
    return []


async def _collect_questions(session: AsyncSession, kind: str) -> list[dict]:
    """从该输出智能体启用的技能里收集题目；按技能顺序拼接。"""
    skill_ids = await _get_agent_skill_ids(session, kind)
    if not skill_ids:
        return []
    skills = (await session.execute(
        select(Skill).where(Skill.id.in_(skill_ids))
    )).scalars().all()
    # 保持与 skill_ids 顺序一致
    by_id = {s.id: s for s in skills}
    questions: list[dict] = []
    for sid in skill_ids:
        s = by_id.get(sid)
        if not s or not s.questions:
            continue
        for q in s.questions:
            if not isinstance(q, dict):
                continue
            key = q.get("key")
            text = q.get("question")
            if not key or not text:
                continue
            questions.append({
                "key": key,
                "stage": q.get("stage") or "",
                "question": text,
                "hint": q.get("hint") or "",
                "skill_id": sid,
                "skill_name": s.name,
            })
    return questions


@router.get("/{kind}")
async def get_interview(kind: str, project_id: str, session: AsyncSession = Depends(get_session)):
    if kind not in INTERVIEW_KINDS:
        raise HTTPException(400, f"Invalid kind. Must be one of: {INTERVIEW_KINDS}")
    proj = await session.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "项目不存在")

    questions = await _collect_questions(session, kind)
    answers_rows = (await session.execute(
        select(ProjectInterviewAnswer).where(
            ProjectInterviewAnswer.project_id == project_id,
            ProjectInterviewAnswer.output_kind == kind,
        )
    )).scalars().all()
    answers = {a.question_key: a.answer for a in answers_rows}

    next_key = None
    for q in questions:
        if not (answers.get(q["key"]) or "").strip():
            next_key = q["key"]
            break

    return {
        "project": {"id": proj.id, "name": proj.name, "customer": proj.customer},
        "kind": kind,
        "questions": questions,
        "answers": answers,
        "next_key": next_key,
        "complete": next_key is None and len(questions) > 0,
        "total": len(questions),
        "answered": sum(1 for q in questions if (answers.get(q["key"]) or "").strip()),
    }


class AnswerBody(BaseModel):
    project_id: str = Field(..., min_length=1)
    question_key: str = Field(..., min_length=1)
    question_text: str = Field(..., min_length=1)
    answer: str = ""


@router.put("/{kind}/answer")
async def upsert_answer(kind: str, body: AnswerBody, session: AsyncSession = Depends(get_session)):
    if kind not in INTERVIEW_KINDS:
        raise HTTPException(400, f"Invalid kind. Must be one of: {INTERVIEW_KINDS}")
    proj = await session.get(Project, body.project_id)
    if not proj:
        raise HTTPException(404, "项目不存在")

    row = (await session.execute(
        select(ProjectInterviewAnswer).where(
            ProjectInterviewAnswer.project_id == body.project_id,
            ProjectInterviewAnswer.output_kind == kind,
            ProjectInterviewAnswer.question_key == body.question_key,
        )
    )).scalar_one_or_none()

    if row:
        row.answer = body.answer
        row.question_text = body.question_text
    else:
        row = ProjectInterviewAnswer(
            project_id=body.project_id,
            output_kind=kind,
            question_key=body.question_key,
            question_text=body.question_text,
            answer=body.answer,
        )
        session.add(row)
    await session.commit()
    return {"ok": True}
