import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from agents.kb_agent import answer_question, answer_question_stream, generate_doc
from services.rate_limit import limiter

router = APIRouter()


class AskRequest(BaseModel):
    question: str
    ltc_stage: str | None = None
    industry: str | None = None


class GenerateDocRequest(BaseModel):
    template: str
    project_name: str
    industry: str
    query: str | None = None


@router.post("/ask")
@limiter.limit("60/minute")
async def ask_question(request: Request, req: AskRequest):
    return await answer_question(req.question, ltc_stage=req.ltc_stage, industry=req.industry)


@router.post("/ask-stream")
@limiter.limit("60/minute")
async def ask_question_stream_endpoint(request: Request, req: AskRequest):
    """SSE streaming endpoint. Events: data: {...}\n\n  Terminated with: data: [DONE]\n\n"""
    async def event_generator():
        try:
            async for chunk in answer_question_stream(
                req.question, ltc_stage=req.ltc_stage, industry=req.industry
            ):
                yield f"data: {chunk}\n\n"
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


@router.post("/generate-doc")
@limiter.limit("30/minute")
async def generate_document(request: Request, req: GenerateDocRequest):
    content = await generate_doc(req.template, req.project_name, req.industry, req.query)
    return {"content": content}
