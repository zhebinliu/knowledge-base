"""项目待办看板 API — CRUD + 同步 + 批量 + 逾期 + 依赖 + 跨项目汇总 + AI 分配。"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_, or_
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
    due_date: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None
    blocked_by: Optional[int] = None


class TodoCreate(BaseModel):
    content: str
    assignee: str = ""
    due_date: Optional[str] = None
    priority: str = "P1"
    note: Optional[str] = None


class BatchPatch(BaseModel):
    ids: list[int]
    status: Optional[str] = None
    assignee: Optional[str] = None
    priority: Optional[str] = None


# ── 序列化 ──────────────────────────────────────────────────────────

def _todo_dto(t: ProjectTodo, meeting_title: str | None = None, meeting_date: str | None = None, blocked_by_content: str | None = None) -> dict:
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
        "blocked_by": t.blocked_by,
        "blocked_by_content": blocked_by_content,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "meeting_title": meeting_title,
        "meeting_date": meeting_date,
    }


async def _enrich_todos(session: AsyncSession, todos: list[ProjectTodo]) -> list[dict]:
    """批量 join meeting 信息和 blocked_by 信息。"""
    meeting_ids = {r.meeting_id for r in todos if r.meeting_id}
    meeting_map: dict[int, tuple[str, str]] = {}
    if meeting_ids:
        meetings = (await session.scalars(select(Meeting).where(Meeting.id.in_(meeting_ids)))).all()
        for m in meetings:
            meeting_map[m.id] = (m.title, m.start_time.strftime("%Y-%m-%d") if m.start_time else "")

    blocked_ids = {r.blocked_by for r in todos if r.blocked_by}
    blocked_map: dict[int, str] = {}
    if blocked_ids:
        blockers = (await session.scalars(select(ProjectTodo).where(ProjectTodo.id.in_(blocked_ids)))).all()
        for b in blockers:
            blocked_map[b.id] = b.content

    return [
        _todo_dto(r, *meeting_map.get(r.meeting_id, (None, None)), blocked_map.get(r.blocked_by))
        for r in todos
    ]


# ── 同步逻辑(可复用) ─────────────────────────────────────────────────

async def sync_todos_for_meeting(meeting_id: int, session: AsyncSession) -> int:
    """从单个会议的 action_items 导入待办（幂等），返回新增数量。"""
    m = await session.get(Meeting, meeting_id)
    if not m or not m.project_id or not m.meeting_minutes:
        return 0

    mt = m.meeting_minutes
    items = mt.get("action_items") or []
    if not items:
        return 0

    existing = (await session.scalars(
        select(ProjectTodo).where(
            and_(ProjectTodo.project_id == m.project_id, ProjectTodo.meeting_id == meeting_id)
        )
    )).all()
    existing_keys = {(t.meeting_id, t.content) for t in existing}

    imported = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        task = (item.get("task") or "").strip()
        if not task or (meeting_id, task) in existing_keys:
            continue

        raw_pri = (item.get("priority") or "medium").lower()
        pri_map = {"high": "P0", "medium": "P1", "low": "P2"}
        priority = pri_map.get(raw_pri, "P1")

        due = None
        deadline = (item.get("deadline") or "").strip()
        if deadline:
            try:
                due = date.fromisoformat(deadline)
            except ValueError:
                pass

        todo = ProjectTodo(
            project_id=m.project_id,
            meeting_id=meeting_id,
            content=task,
            assignee=(item.get("owner") or "").strip(),
            due_date=due,
            priority=priority,
            status="pending",
            source_quote=(item.get("remark") or "").strip() or None,
        )
        session.add(todo)
        existing_keys.add((meeting_id, task))
        imported += 1

    if imported:
        await session.commit()
    return imported


async def sync_todos_for_project(project_id: str, session: AsyncSession) -> dict:
    """从项目下所有会议的 action_items 批量导入待办（幂等）。"""
    meetings = (await session.scalars(
        select(Meeting).where(
            and_(Meeting.project_id == project_id, Meeting.meeting_minutes.isnot(None))
        )
    )).all()

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
            if not task or (m.id, task) in existing_keys:
                continue

            raw_pri = (item.get("priority") or "medium").lower()
            pri_map = {"high": "P0", "medium": "P1", "low": "P2"}
            priority = pri_map.get(raw_pri, "P1")

            due = None
            deadline = (item.get("deadline") or "").strip()
            if deadline:
                try:
                    due = date.fromisoformat(deadline)
                except ValueError:
                    pass

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

    if imported:
        await session.commit()
    return {"imported": imported, "meetings_scanned": len(meetings)}


# ── 回写会议纪要 ─────────────────────────────────────────────────────

async def _write_back_to_meeting(todo: ProjectTodo, session: AsyncSession) -> None:
    """将待办状态变更回写到源会议 meeting_minutes.action_items。"""
    if not todo.meeting_id:
        return
    m = await session.get(Meeting, todo.meeting_id)
    if not m or not m.meeting_minutes:
        return

    mt = dict(m.meeting_minutes)
    items = mt.get("action_items") or []
    status_map = {"pending": "待办", "doing": "进行中", "done": "已完成"}
    changed = False
    for item in items:
        if isinstance(item, dict) and (item.get("task") or "").strip() == todo.content:
            item["status"] = status_map.get(todo.status, todo.status)
            changed = True
            break
    if changed:
        m.meeting_minutes = mt
        await session.commit()


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
    conditions = [ProjectTodo.project_id == project_id]
    if status:
        conditions.append(ProjectTodo.status == status)
    if assignee:
        conditions.append(ProjectTodo.assignee == assignee)
    if priority:
        conditions.append(ProjectTodo.priority == priority)

    rows = (await session.scalars(
        select(ProjectTodo).where(and_(*conditions)).order_by(
            ProjectTodo.status.asc(),
            ProjectTodo.priority.asc(),
            ProjectTodo.due_date.asc().nulls_last(),
        )
    )).all()
    return await _enrich_todos(session, rows)


# ── GET /api/todos/overdue ───────────────────────────────────────────

@router.get("/todos/overdue")
async def get_overdue_todos(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """跨项目查询逾期待办。"""
    rows = (await session.scalars(
        select(ProjectTodo).where(
            and_(ProjectTodo.status != "done", ProjectTodo.due_date < date.today())
        ).order_by(ProjectTodo.due_date.asc())
    )).all()
    return await _enrich_todos(session, rows)


# ── GET /api/todos/my ────────────────────────────────────────────────

@router.get("/todos/my")
async def get_my_todos(
    assignee: Optional[str] = None,
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """跨项目按负责人筛选待办。"""
    conditions = []
    if assignee:
        conditions.append(ProjectTodo.assignee == assignee)
    if status:
        conditions.append(ProjectTodo.status == status)
    if not conditions:
        conditions.append(ProjectTodo.status != "done")

    rows = (await session.scalars(
        select(ProjectTodo).where(and_(*conditions)).order_by(
            ProjectTodo.status.asc(),
            ProjectTodo.priority.asc(),
            ProjectTodo.due_date.asc().nulls_last(),
        )
    )).all()
    return await _enrich_todos(session, rows)


# ── POST /api/projects/{project_id}/todos ────────────────────────────

@router.post("/projects/{project_id}/todos")
async def create_todo(
    project_id: str,
    body: TodoCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    due = None
    if body.due_date:
        try:
            due = date.fromisoformat(body.due_date)
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
    return await sync_todos_for_project(project_id, session)


# ── PATCH /api/todos/{todo_id} ───────────────────────────────────────

@router.patch("/todos/{todo_id}")
async def patch_todo(
    todo_id: int,
    body: TodoPatch,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    todo = await session.get(ProjectTodo, todo_id)
    if not todo:
        raise HTTPException(404, "待办不存在")

    status_changed = False
    if body.content is not None:
        todo.content = body.content
    if body.assignee is not None:
        todo.assignee = body.assignee
    if body.due_date is not None:
        if body.due_date == "":
            todo.due_date = None
        else:
            try:
                todo.due_date = date.fromisoformat(body.due_date)
            except ValueError:
                raise HTTPException(400, "due_date 格式错误")
    if body.priority is not None:
        if body.priority not in ("P0", "P1", "P2"):
            raise HTTPException(400, "priority 需为 P0/P1/P2")
        todo.priority = body.priority
    if body.status is not None:
        if body.status not in ("pending", "doing", "done"):
            raise HTTPException(400, "status 需为 pending/doing/done")
        # 依赖检查：被阻塞时不能标记完成
        if body.status == "done" and todo.blocked_by:
            blocker = await session.get(ProjectTodo, todo.blocked_by)
            if blocker and blocker.status != "done":
                raise HTTPException(400, f"此待办被「{blocker.content}」阻塞，请先完成前置待办")
        if body.status != todo.status:
            status_changed = True
        todo.status = body.status
    if body.note is not None:
        todo.note = body.note
    if body.blocked_by is not None:
        if body.blocked_by == 0:
            todo.blocked_by = None
        else:
            blocker = await session.get(ProjectTodo, body.blocked_by)
            if not blocker:
                raise HTTPException(404, "前置待办不存在")
            todo.blocked_by = body.blocked_by

    todo.updated_at = datetime.utcnow()
    await session.commit()

    # 状态变更时回写会议纪要
    if status_changed:
        await _write_back_to_meeting(todo, session)

    await session.refresh(todo)
    return _todo_dto(todo)


# ── PATCH /api/todos/batch ───────────────────────────────────────────

@router.patch("/todos/batch")
async def batch_patch_todos(
    body: BatchPatch,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """批量更新待办。"""
    if not body.ids:
        raise HTTPException(400, "ids 不能为空")
    if len(body.ids) > 100:
        raise HTTPException(400, "单次最多 100 条")

    todos = (await session.scalars(
        select(ProjectTodo).where(ProjectTodo.id.in_(body.ids))
    )).all()

    updated = 0
    for todo in todos:
        if body.status:
            if body.status not in ("pending", "doing", "done"):
                continue
            # 依赖检查
            if body.status == "done" and todo.blocked_by:
                blocker = await session.get(ProjectTodo, todo.blocked_by)
                if blocker and blocker.status != "done":
                    continue
            todo.status = body.status
        if body.assignee is not None:
            todo.assignee = body.assignee
        if body.priority:
            if body.priority in ("P0", "P1", "P2"):
                todo.priority = body.priority
        todo.updated_at = datetime.utcnow()
        updated += 1

    await session.commit()
    return {"updated": updated}


# ── DELETE /api/todos/{todo_id} ──────────────────────────────────────

@router.delete("/todos/{todo_id}")
async def delete_todo(
    todo_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    todo = await session.get(ProjectTodo, todo_id)
    if not todo:
        raise HTTPException(404, "待办不存在")
    # 清除依赖此待办的阻塞关系
    blocked = (await session.scalars(
        select(ProjectTodo).where(ProjectTodo.blocked_by == todo_id)
    )).all()
    for b in blocked:
        b.blocked_by = None
    await session.delete(todo)
    await session.commit()
    return {"ok": True}


# ── POST /api/todos/{todo_id}/smart-assign ───────────────────────────

@router.post("/todos/{todo_id}/smart-assign")
async def smart_assign(
    todo_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """AI 智能分配：从源会议 transcript 分析最佳负责人。"""
    from services.model_router import model_router

    todo = await session.get(ProjectTodo, todo_id)
    if not todo:
        raise HTTPException(404, "待办不存在")
    if not todo.meeting_id:
        raise HTTPException(400, "此待办无来源会议，无法智能分配")

    m = await session.get(Meeting, todo.meeting_id)
    if not m:
        raise HTTPException(404, "来源会议不存在")

    transcript = m.polished_transcript or m.raw_transcript or ""
    if not transcript:
        raise HTTPException(400, "会议无转写文本")

    # 截取前 8000 字符
    context = transcript[:8000]
    messages = [
        {"role": "system", "content": (
            "你是会议分析助手。根据会议转写文本，分析指定待办最适合由谁负责。"
            "返回 JSON: {\"assignee\": \"姓名\", \"reason\": \"理由(一句话)\"}"
            "\n只输出 JSON，不要其他内容。"
        )},
        {"role": "user", "content": (
            f"会议转写文本:\n{context}\n\n"
            f"待办内容: {todo.content}\n"
            f"当前负责人: {todo.assignee or '未指定'}\n\n"
            "请分析谁最适合负责这个待办。"
        )},
    ]

    try:
        content, _ = await model_router.chat_with_routing(
            task="meeting_illustrations_extract",
            messages=messages,
            temperature=0.2,
            max_tokens=200,
            response_format={"type": "json_object"},
        )
        import json
        result = json.loads(content)
        return {
            "assignee": result.get("assignee", ""),
            "reason": result.get("reason", ""),
            "current": todo.assignee,
        }
    except Exception as e:
        raise HTTPException(500, f"AI 分配失败: {str(e)[:200]}")
