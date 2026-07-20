"""命题网络 API — 场景命中神经网络。

POST /api/projects/{project_id}/proposition-network         异步构建
GET  /api/projects/{project_id}/proposition-network         查询最新网络数据
GET  /api/projects/{project_id}/proposition-network/status  轮询构建状态
"""
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.project import Project
from models.proposition import PropositionNetwork
from services.auth import get_current_user
from services.project_acl import assert_project_access
from models.user import User

logger = structlog.get_logger()
router = APIRouter()


class NetworkBuildDto(BaseModel):
    task_id: str
    status: str = "started"


class NetworkStatusDto(BaseModel):
    state: str
    ready: bool
    stats: dict | None = None
    error: str | None = None


class NetworkDto(BaseModel):
    project_id: str
    stats: dict
    network: dict
    doc_count: int
    proposition_count: int
    scene_hit_count: int
    updated_at: datetime | None = None


@router.post("/projects/{project_id}/proposition-network", response_model=NetworkBuildDto)
async def build_network(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """异步构建项目命题网络(LLM 抽取 + 聚类 + 场景对齐)。"""
    await assert_project_access(current_user, project_id, "write")
    proj = await session.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "项目不存在")

    from tasks.output_tasks import build_proposition_network_task
    task = build_proposition_network_task.delay(project_id, current_user.username)
    logger.info("proposition_network_dispatched", project_id=project_id,
                task_id=task.id, by=current_user.username)
    return NetworkBuildDto(task_id=task.id)


@router.get("/projects/{project_id}/proposition-network/status/{task_id}", response_model=NetworkStatusDto)
async def network_build_status(
    project_id: str,
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """轮询命题网络构建状态。"""
    from tasks.convert_task import celery_app
    res = celery_app.AsyncResult(task_id)
    dto = NetworkStatusDto(state=res.state, ready=res.ready())
    if res.successful():
        dto.stats = res.result if isinstance(res.result, dict) else None
    elif res.failed():
        dto.error = str(res.result)[:200]
    return dto


@router.get("/projects/{project_id}/proposition-network", response_model=NetworkDto | None)
async def get_network(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """获取项目最新命题网络数据(用于前端可视化)。"""
    await assert_project_access(current_user, project_id, "read")
    row = (await session.execute(
        select(PropositionNetwork).where(PropositionNetwork.project_id == project_id)
    )).scalar_one_or_none()
    if not row:
        return None
    return NetworkDto(
        project_id=row.project_id,
        stats=row.stats or {},
        network=row.network_data or {},
        doc_count=row.doc_count,
        proposition_count=row.proposition_count,
        scene_hit_count=row.scene_hit_count,
        updated_at=row.updated_at,
    )
