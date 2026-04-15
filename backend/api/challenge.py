import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
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
      data: {"status": "进度描述"}\n\n        — progress message
      data: {"result": {...}}\n\n             — one completed question result
      data: [DONE]\n\n                        — finished
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


@router.get("/gaps")
async def get_gaps():
    return {"message": "知识盲区分析功能（Phase 3 实现）"}
