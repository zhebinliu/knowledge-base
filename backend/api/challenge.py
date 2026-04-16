import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import get_session
from models.challenge_schedule import ChallengeSchedule
from agents.challenger_agent import run_challenge_stream

router = APIRouter()


class ChallengeRunRequest(BaseModel):
    target_stages: list[str] = ["线索", "商机"]
    questions_per_stage: int = 2


@router.post("/run-stream")
async def run_challenge_sse(req: ChallengeRunRequest):
    """
    SSE streaming challenge endpoint.
    Yields events:
      data: {"status": "..."}\n\n        -- progress message
      data: {"type": "result", ...}\n\n  -- one completed question result
      data: [DONE]\n\n                   -- finished
    """
    async def event_generator():
        try:
            async for event in run_challenge_stream(req.target_stages, req.questions_per_stage):
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
