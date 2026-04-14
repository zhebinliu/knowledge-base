from fastapi import APIRouter
from pydantic import BaseModel
from agents.kb_agent import answer_question, generate_doc

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
async def ask_question(req: AskRequest):
    return await answer_question(req.question, ltc_stage=req.ltc_stage, industry=req.industry)


@router.post("/generate-doc")
async def generate_document(req: GenerateDocRequest):
    content = await generate_doc(req.template, req.project_name, req.industry, req.query)
    return {"content": content}
