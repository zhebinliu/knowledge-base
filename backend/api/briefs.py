"""Brief CRUD + auto-extraction endpoints."""
import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session, async_session_maker
from models.project import Project
from models.project_brief import ProjectBrief
from models.user import User
from services.auth import get_current_user
from services.brief_service import (
    BRIEF_SCHEMAS, get_schema, empty_brief,
    merge_extract_with_user_edits, extract_brief_draft,
    stream_extract_brief_draft,
)

router = APIRouter()


def _dto(brief: ProjectBrief | None, kind: str, project_id: str) -> dict:
    schema = get_schema(kind)
    if brief:
        fields = brief.fields or {}
        return {
            "project_id": project_id,
            "output_kind": kind,
            "fields": fields,
            "schema": schema,
            "updated_at": brief.updated_at,
            "exists": True,
        }
    return {
        "project_id": project_id,
        "output_kind": kind,
        "fields": empty_brief(kind),
        "schema": schema,
        "updated_at": None,
        "exists": False,
    }


@router.get("/{kind}")
async def get_brief(
    kind: str,
    project_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if kind not in BRIEF_SCHEMAS:
        raise HTTPException(404, f"Unsupported output_kind: {kind}")
    proj = await session.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    brief = (await session.execute(
        select(ProjectBrief).where(
            ProjectBrief.project_id == project_id,
            ProjectBrief.output_kind == kind,
        )
    )).scalar_one_or_none()
    return _dto(brief, kind, project_id)


@router.post("/{kind}/extract")
async def extract_brief(
    kind: str,
    project_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """LLM 抽取草稿（不入库）。前端拿到后与已有 brief 合并（保留用户已编辑字段）展示。"""
    if kind not in BRIEF_SCHEMAS:
        raise HTTPException(404, f"Unsupported output_kind: {kind}")
    proj = await session.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "Project not found")

    existing = (await session.execute(
        select(ProjectBrief).where(
            ProjectBrief.project_id == project_id,
            ProjectBrief.output_kind == kind,
        )
    )).scalar_one_or_none()

    draft = await extract_brief_draft(project_id, kind)
    merged = merge_extract_with_user_edits(existing.fields if existing else {}, draft)
    return {
        "project_id": project_id,
        "output_kind": kind,
        "fields": merged,
        "schema": get_schema(kind),
    }


@router.post("/{kind}/extract/stream")
async def extract_brief_stream(
    kind: str,
    project_id: str = Query(...),
    current_user: User = Depends(get_current_user),
):
    """SSE 流式抽取：逐阶段吐进度，最终事件携带 merged fields。"""
    if kind not in BRIEF_SCHEMAS:
        raise HTTPException(404, f"Unsupported output_kind: {kind}")

    async def gen():
        existing_fields: dict = {}
        async with async_session_maker() as s:
            proj = await s.get(Project, project_id)
            if not proj:
                yield f"data: {json.dumps({'type':'error','message':'Project not found'})}\n\n"
                return
            existing = (await s.execute(
                select(ProjectBrief).where(
                    ProjectBrief.project_id == project_id,
                    ProjectBrief.output_kind == kind,
                )
            )).scalar_one_or_none()
            if existing:
                existing_fields = existing.fields or {}

        # 用队列把生成器事件 + 心跳合并；LLM 长 await 期间靠 ping 保活
        q: asyncio.Queue = asyncio.Queue()

        async def producer():
            try:
                async for ev in stream_extract_brief_draft(project_id, kind):
                    await q.put(("event", ev))
            except Exception as e:
                await q.put(("event", {"type": "error", "message": str(e)}))
            finally:
                await q.put(("end", None))

        task = asyncio.create_task(producer())
        try:
            yield ": connected\n\n"  # 立即冲一行让客户端拿到响应头
            while True:
                try:
                    kind_, payload = await asyncio.wait_for(q.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue
                if kind_ == "end":
                    break
                ev = payload
                if ev.get("type") == "done":
                    merged = merge_extract_with_user_edits(existing_fields, ev.get("fields") or {})
                    out = {"type": "done", "fields": merged, "schema": get_schema(kind)}
                    yield f"data: {json.dumps(out, ensure_ascii=False)}\n\n"
                else:
                    yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


class PutBriefBody(BaseModel):
    fields: dict


@router.put("/{kind}")
async def put_brief(
    kind: str,
    body: PutBriefBody,
    project_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if kind not in BRIEF_SCHEMAS:
        raise HTTPException(404, f"Unsupported output_kind: {kind}")
    proj = await session.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "Project not found")

    brief = (await session.execute(
        select(ProjectBrief).where(
            ProjectBrief.project_id == project_id,
            ProjectBrief.output_kind == kind,
        )
    )).scalar_one_or_none()

    if brief:
        brief.fields = body.fields
        brief.updated_by = current_user.id
    else:
        brief = ProjectBrief(
            project_id=project_id,
            output_kind=kind,
            fields=body.fields,
            updated_by=current_user.id,
        )
        session.add(brief)
    await session.commit()
    await session.refresh(brief)
    return _dto(brief, kind, project_id)
