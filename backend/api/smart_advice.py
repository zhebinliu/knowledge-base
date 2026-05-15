"""项目 AI 智能建议 API。

GET  /api/projects/{id}/smart-advice            — 取(必要时同步生成)
POST /api/projects/{id}/smart-advice/refresh    — 强制刷新

懒生成策略:
  - GET 时如果 cache miss / stale / inputs 变了, 同步等待 LLM (5-15s)
  - 前端用 React Query 处理 loading state
  - 4 个事件触发 mark_stale (在各自的 handler 里调) — 不在这里集成
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.project import Project
from models.user import User
from services.auth import get_current_user
from services.project_acl import assert_project_access
from services.smart_advice import get_or_generate_advice, get_advice_only

router = APIRouter()
logger = structlog.get_logger()


async def _ensure_project_access(
    project_id: str, user: User, session: AsyncSession,
) -> Project:
    proj = await session.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "project not found")
    await assert_project_access(session, project_id, user)
    return proj


@router.get("/projects/{project_id}/smart-advice")
async def get_smart_advice(
    project_id: str,
    fresh_only: bool = False,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取项目智能建议。
    fresh_only=True 表示「只读, 不触发生成」(前端 hover/preview 用)。
    默认会在 cache miss 时同步等待 LLM(5-15 秒)。
    """
    await _ensure_project_access(project_id, user, session)

    if fresh_only:
        existing = await get_advice_only(project_id)
        if not existing:
            return {"exists": False}
        return {"exists": True, **existing}

    try:
        advice = await get_or_generate_advice(project_id, force=False)
    except Exception as e:
        logger.error("smart_advice_get_failed", project_id=project_id, error=str(e)[:300])
        raise HTTPException(500, f"生成建议失败: {str(e)[:200]}")
    return {"exists": True, **advice}


@router.post("/projects/{project_id}/smart-advice/refresh")
async def refresh_smart_advice(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """强制重新生成建议(用户手动点刷新按钮)。"""
    await _ensure_project_access(project_id, user, session)
    try:
        advice = await get_or_generate_advice(project_id, force=True)
    except Exception as e:
        logger.error("smart_advice_refresh_failed", project_id=project_id, error=str(e)[:300])
        raise HTTPException(500, f"刷新建议失败: {str(e)[:200]}")
    return advice
