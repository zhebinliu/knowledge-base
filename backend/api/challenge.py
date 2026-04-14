from fastapi import APIRouter
from pydantic import BaseModel
from agents.challenger_agent import run_challenge_batch

router = APIRouter()


class ChallengeRunRequest(BaseModel):
    target_stages: list[str] = ["delivery", "opportunity"]
    questions_per_stage: int = 5


@router.post("/run")
async def run_challenge(req: ChallengeRunRequest):
    return await run_challenge_batch(req.target_stages, req.questions_per_stage)


@router.get("/gaps")
async def get_gaps():
    return {"message": "知识盲区分析功能（Phase 3 实现）"}
