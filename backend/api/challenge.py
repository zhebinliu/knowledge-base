import json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from models import get_session
from models.challenge_schedule import ChallengeSchedule
from models.challenge_run import ChallengeRun
from models.chunk import Chunk
from models.user import User
from services.auth import get_current_user_optional, decode_access_token
from agents.challenger_agent import run_challenge_stream

router = APIRouter()


class ChallengeRunRequest(BaseModel):
    target_stages: list[str] = ["线索", "商机"]
    questions_per_stage: int = 2


@router.post("/run-stream")
async def run_challenge_sse(
    req: ChallengeRunRequest,
    user: User | None = Depends(get_current_user_optional),
):
    """
    SSE streaming challenge endpoint.
    Yields events:
      data: {"status": "..."}\n\n        -- progress message
      data: {"type": "result", ...}\n\n  -- one completed question result
      data: [DONE]\n\n                   -- finished
    """
    triggered_by = user.id if user else None
    triggered_by_name = (user.full_name or user.username) if user else None

    async def event_generator():
        try:
            async for event in run_challenge_stream(
                req.target_stages,
                req.questions_per_stage,
                trigger_type="manual",
                triggered_by=triggered_by,
                triggered_by_name=triggered_by_name,
            ):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
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


# ---- Run history (C5) ----

def _run_dto(r: ChallengeRun) -> dict:
    duration = None
    if r.finished_at and r.started_at:
        duration = int((r.finished_at - r.started_at).total_seconds())
    pass_rate = (r.passed / r.total) if r.total else 0.0
    return {
        "id": r.id,
        "trigger_type": r.trigger_type,
        "triggered_by": r.triggered_by,
        "triggered_by_name": r.triggered_by_name,
        "target_stages": r.target_stages,
        "questions_per_stage": r.questions_per_stage,
        "started_at": r.started_at,
        "finished_at": r.finished_at,
        "duration_seconds": duration,
        "total": r.total,
        "passed": r.passed,
        "failed": r.failed,
        "pass_rate": round(pass_rate, 3),
        "status": r.status,
        "error_message": r.error_message,
    }


@router.get("/runs")
async def list_challenge_runs(
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    if limit > 200:
        limit = 200
    # 把超时（30 分钟仍 running）的 run 标为 failed，防止历史里"卡住"
    from datetime import datetime, timezone, timedelta
    stale_cutoff = (datetime.now(timezone.utc).replace(tzinfo=None)) - timedelta(minutes=30)
    stale = await session.execute(
        select(ChallengeRun).where(
            ChallengeRun.status == "running",
            ChallengeRun.started_at < stale_cutoff,
        )
    )
    for r in stale.scalars().all():
        r.status = "failed"
        r.error_message = r.error_message or "执行超时（>30 分钟未完成，可能客户端断连）"
        r.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await session.commit()

    total = await session.scalar(select(func.count()).select_from(ChallengeRun)) or 0
    result = await session.execute(
        select(ChallengeRun)
        .order_by(ChallengeRun.started_at.desc())
        .limit(limit).offset(offset)
    )
    items = result.scalars().all()
    return {
        "total": total,
        "items": [_run_dto(r) for r in items],
    }


@router.get("/runs/{run_id}")
async def get_challenge_run(
    run_id: str,
    session: AsyncSession = Depends(get_session),
):
    run = await session.get(ChallengeRun, run_id)
    if not run:
        raise HTTPException(404, "挑战记录不存在")
    chunks_res = await session.execute(
        select(Chunk).where(Chunk.batch_id == run_id).order_by(Chunk.chunk_index.asc())
    )
    chunks = chunks_res.scalars().all()
    return {
        **_run_dto(run),
        "questions": [
            {
                "chunk_id": c.id,
                "ltc_stage": c.ltc_stage,
                "score": c.ltc_stage_confidence,
                "review_status": c.review_status,
                "tags": c.tags,
                "content": c.content,
                "created_at": c.created_at,
            }
            for c in chunks
        ],
    }


# ---- Schedule CRUD ----

class ScheduleRequest(BaseModel):
    name: str = "默认计划"
    stages: list[str] = ["线索", "商机"]
    questions_per_stage: int = 2
    cron_expression: str = "0 9 * * 1-5"
    enabled: bool = False


@router.get("/schedules")
async def list_schedules(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(ChallengeSchedule).order_by(ChallengeSchedule.created_at.desc())
    )
    items = result.scalars().all()
    return [
        {
            "id": s.id, "name": s.name, "stages": s.stages,
            "questions_per_stage": s.questions_per_stage,
            "cron_expression": s.cron_expression,
            "enabled": s.enabled, "last_run_at": s.last_run_at,
        }
        for s in items
    ]


@router.post("/schedules")
async def create_schedule(req: ScheduleRequest, session: AsyncSession = Depends(get_session)):
    schedule = ChallengeSchedule(
        name=req.name, stages=req.stages,
        questions_per_stage=req.questions_per_stage,
        cron_expression=req.cron_expression,
        enabled=req.enabled,
    )
    session.add(schedule)
    await session.commit()
    await session.refresh(schedule)
    return {"id": schedule.id, "ok": True}


@router.put("/schedules/{schedule_id}")
async def update_schedule(schedule_id: str, req: ScheduleRequest, session: AsyncSession = Depends(get_session)):
    schedule = await session.get(ChallengeSchedule, schedule_id)
    if not schedule:
        from fastapi import HTTPException
        raise HTTPException(404, "计划不存在")
    schedule.name = req.name
    schedule.stages = req.stages
    schedule.questions_per_stage = req.questions_per_stage
    schedule.cron_expression = req.cron_expression
    schedule.enabled = req.enabled
    await session.commit()
    return {"ok": True}


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str, session: AsyncSession = Depends(get_session)):
    schedule = await session.get(ChallengeSchedule, schedule_id)
    if not schedule:
        from fastapi import HTTPException
        raise HTTPException(404, "计划不存在")
    await session.delete(schedule)
    await session.commit()
    return {"ok": True}


@router.post("/schedules/{schedule_id}/toggle")
async def toggle_schedule(schedule_id: str, session: AsyncSession = Depends(get_session)):
    schedule = await session.get(ChallengeSchedule, schedule_id)
    if not schedule:
        from fastapi import HTTPException
        raise HTTPException(404, "计划不存在")
    schedule.enabled = not schedule.enabled
    await session.commit()
    return {"id": schedule.id, "enabled": schedule.enabled}


@router.get("/gaps")
async def get_gaps():
    return {"message": "知识盲区分析功能（Phase 3 实现）"}
