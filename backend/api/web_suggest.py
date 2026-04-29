"""Web 抓取建议 API。

给前端 V2GapFiller 的「✨ 试试网络获取」按钮用 — 给定一个待补字段(field_label /
question)+ 项目上下文(客户、行业),后端跑 Web 搜索,返回 1-3 条候选答案 + 来源,
让用户判断采纳。

没配 Web search key 时返回 503 + 提示信息,前端按钮灰显。
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from models import async_session_maker
from models.project import Project
from services.auth import get_current_user

logger = structlog.get_logger()
router = APIRouter()


class WebSuggestBody(BaseModel):
    project_id: str
    field_key: str
    field_label: str
    question: str           # 字段对应的问题(GapFiller 里展示的那段)
    field_type: str = "text"


class WebSuggestCandidate(BaseModel):
    text: str               # 候选答案(从 Web 摘要里拼出来,~80 字)
    source_title: str
    source_url: str
    source_domain: str


@router.post("", dependencies=[Depends(get_current_user)])
async def suggest_from_web(body: WebSuggestBody):
    """跑 Web 搜索,返回 1-3 条候选答案给用户裁决。"""
    from services.web_search_service import web_search, has_web_search_provider

    if not await has_web_search_provider():
        raise HTTPException(503, "未配置 Web search API key,请联系管理员到「系统设置 · API 密钥」配置 bocha_api_key 或 tavily_api_key")

    async with async_session_maker() as s:
        proj = await s.get(Project, body.project_id) if body.project_id else None
    customer = (proj.customer if proj else "") or ""
    industry = (proj.industry if proj else "") or ""

    # 拼 query — 字段标签 + 客户/行业上下文
    query_parts = [body.field_label]
    if customer:
        query_parts.append(customer)
    if industry:
        query_parts.append(industry)
    query = " ".join(query_parts).strip()
    if not query:
        raise HTTPException(400, "字段标签为空,无法搜索")

    try:
        hits = await web_search(query, top_k=5)
    except Exception as e:
        logger.warning("web_suggest_search_failed", err=str(e)[:120])
        raise HTTPException(502, f"Web 搜索失败:{str(e)[:120]}")

    if not hits:
        return {
            "ok": True,
            "query": query,
            "candidates": [],
            "note": "Web 没找到相关结果,建议换个角度问 / 直接填",
        }

    # 把搜索结果拼成"候选答案":摘要前 100-150 字 + 来源
    candidates = []
    for h in hits[:3]:
        text = (h.get("snippet") or h.get("title") or "").strip()
        if len(text) > 200:
            text = text[:200] + "…"
        url = h.get("url") or ""
        domain = url.split("/")[2] if "//" in url else url
        candidates.append({
            "text": text,
            "source_title": (h.get("title") or "")[:120],
            "source_url": url,
            "source_domain": domain,
        })

    logger.info("web_suggest_returned", project_id=body.project_id,
                field=body.field_key, n=len(candidates))
    return {
        "ok": True,
        "query": query,
        "candidates": candidates,
        "note": "结果来自互联网公开信息,仅供参考。建议交叉验证后采纳。",
    }
