"""项目待办看板 API — CRUD + 从会议 action_items 同步导入。"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from services.auth import get_current_user
from models import get_session
from models.project_todo import ProjectTodo
from models.meeting import Meeting
from models.user import User

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────

class TodoPatch(BaseModel):
    content: Optional[str] = None
    assignee: Optional[str] = None
    due_date: Optional[str] = None  # "YYYY-MM-DD" or null
    priority: Optional[str] = None  # P0/P1/P2
    status: Optional[str] = None    # pending/doing/done
    note: Optional[str] = None


class TodoCreate(BaseModel):
    content: str
    assignee: str = ""
    due_date: Optional[str] = None
    priority: str = "P1"
    note: Optional[str] = None


# ── 序列化 ──────────────────────────────────────────────────────────

def _todo_dto(t: ProjectTodo, meeting_title: str | None = None, meeting_date: str | None = None) -> dict:
    return {
        "id": t.id,
        "project_id": t.project_id,
        "meeting_id": t.meeting_id,
        "content": t.content,
        "assignee": t.assignee,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "priority": t.priority,
        "status": t.status,
        "source_quote": t.source_quote,
        "note": t.note,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "meeting_title": meeting_title,
        "meeting_date": meeting_date,
    }


# ── GET /api/projects/{project_id}/todos ─────────────────────────────

@router.get("/projects/{project_id}/todos")
async def list_todos(
    project_id: str,
    status: Optional[str] = None,
    assignee: Optional[str] = None,
    priority: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取项目全部待办，支持筛选。"""
    conditions = [ProjectTodo.project_id == project_id]
    if status:
        conditions.append(ProjectTodo.status == status)
    if assignee:
        conditions.append(ProjectTodo.assignee == assignee)
    if priority:
        conditions.append(ProjectTodo.priority == priority)

    rows = (await session.scalars(
        select(ProjectTodo).where(and_(*conditions)).order_by(
            ProjectTodo.status.asc(),  # pending first
            ProjectTodo.priority.asc(),  # P0 first
            ProjectTodo.due_date.asc().nulls_last(),
        )
    )).all()

    # join meeting info
    meeting_ids = {r.meeting_id for r in rows if r.meeting_id}
    meeting_map: dict[int, tuple[str, str]] = {}
    if meeting_ids:
        meetings = (await session.scalars(
            select(Meeting).where(Meeting.id.in_(meeting_ids))
        )).all()
        for m in meetings:
            mt = m.meeting_minutes or {}
            meeting_map[m.id] = (m.title, m.start_time.strftime("%Y-%m-%d") if m.start_time else "")

    return [
        _todo_dto(r, *meeting_map.get(r.meeting_id, (None, None)))
        for r in rows
    ]


# ── POST /api/projects/{project_id}/todos ────────────────────────────

@router.post("/projects/{project_id}/todos")
async def create_todo(
    project_id: str,
    body: TodoCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """手动创建待办。"""
    from datetime import date as _date
    due = None
    if body.due_date:
        try:
            due = _date.fromisoformat(body.due_date)
        except ValueError:
            raise HTTPException(400, "due_date 格式错误，需 YYYY-MM-DD")

    todo = ProjectTodo(
        project_id=project_id,
        content=body.content,
        assignee=body.assignee,
        due_date=due,
        priority=body.priority,
        status="pending",
        note=body.note,
    )
    session.add(todo)
    await session.commit()
    await session.refresh(todo)
    return _todo_dto(todo)


# ── POST /api/projects/{project_id}/todos/sync ───────────────────────

@router.post("/projects/{project_id}/todos/sync")
async def sync_todos(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """从该项目下所有会议的 action_items 批量导入待办（幂等，跳过已导入的）。"""
    # 查询该项目下所有有 meeting_minutes 的会议
    meetings = (await session.scalars(
        select(Meeting).where(
            and_(Meeting.project_id == project_id, Meeting.meeting_minutes.isnot(None))
        )
    )).all()

    # 已有待办的 (meeting_id, content) 集合，用于去重
    existing = (await session.scalars(
        select(ProjectTodo).where(ProjectTodo.project_id == project_id)
    )).all()
    existing_keys = {(t.meeting_id, t.content) for t in existing}

    imported = 0
    for m in meetings:
        mt = m.meeting_minutes or {}
        items = mt.get("action_items") or []
        for item in items:
            if not isinstance(item, dict):
                continue
            task = (item.get("task") or "").strip()
            if not task:
                continue
            # 去重
            if (m.id, task) in existing_keys:
                continue

            # 优先级映射
            raw_pri = (item.get("priority") or "medium").lower()
            pri_map = {"high": "P0", "medium": "P1", "low": "P2"}
            priority = pri_map.get(raw_pri, "P1")

            # 截止日期
            from datetime import date as _date
            due = None
            deadline = (item.get("deadline") or "").strip()
            if deadline:
                try:
                    due = _date.fromisoformat(deadline)
                except ValueError:
                    pass  # 无法解析则跳过

            todo = ProjectTodo(
                project_id=project_id,
                meeting_id=m.id,
                content=task,
                assignee=(item.get("owner") or "").strip(),
                due_date=due,
                priority=priority,
                status="pending",
                source_quote=(item.get("remark") or "").strip() or None,
            )
            session.add(todo)
            existing_keys.add((m.id, task))
            imported += 1

    await session.commit()
    return {"imported": imported, "meetings_scanned": len(meetings)}


# ── PATCH /api/todos/{todo_id} ───────────────────────────────────────

@router.patch("/todos/{todo_id}")
async def patch_todo(
    todo_id: int,
    body: TodoPatch,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """更新待办。"""
    todo = await session.get(ProjectTodo, todo_id)
    if not todo:
        raise HTTPException(404, "待办不存在")

    if body.content is not None:
        todo.content = body.content
    if body.assignee is not None:
        todo.assignee = body.assignee
    if body.due_date is not None:
        from datetime import date as _date
        if body.due_date == "":
            todo.due_date = None
        else:
            try:
                todo.due_date = _date.fromisoformat(body.due_date)
            except ValueError:
                raise HTTPException(400, "due_date 格式错误")
    if body.priority is not None:
        if body.priority not in ("P0", "P1", "P2"):
            raise HTTPException(400, "priority 需为 P0/P1/P2")
        todo.priority = body.priority
    if body.status is not None:
        if body.status not in ("pending", "doing", "done"):
            raise HTTPException(400, "status 需为 pending/doing/done")
        todo.status = body.status
    if body.note is not None:
        todo.note = body.note

    todo.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(todo)
    return _todo_dto(todo)


# ── DELETE /api/todos/{todo_id} ──────────────────────────────────────

@router.delete("/todos/{todo_id}")
async def delete_todo(
    todo_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """删除待办。"""
    todo = await session.get(ProjectTodo, todo_id)
    if not todo:
        raise HTTPException(404, "待办不存在")
    await session.delete(todo)
    await session.commit()
    return {"ok": True}
