"""项目待办看板 API — CRUD + 同步 + 批量 + 逾期 + 依赖 + 跨项目汇总 + AI 分配。"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from services.auth import get_current_user
# 新加的四象限端点补上项目 ACL;既有端点缺 ACL 是既有缺口,本次不改其行为(见 task.md)
from services.project_acl import require_project_access
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
    # 四象限两轴。空串 = 清空该轴(回到「未分类」),与 due_date 的约定一致。
    urgency: Optional[str] = None
    necessity: Optional[str] = None


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


class ClassifyIn(BaseModel):
    """四象限分类入参。"""
    # True = 只补两轴不全的(同步后自动分类);False = 重判所有非人工的(重新分类按钮)
    only_unclassified: bool = False
    # 限定 id 子集;None = 全项目
    ids: Optional[list[int]] = None


# ── 四象限(紧急 × 必要) ──────────────────────────────────────────────
# 用户口径:轴为「紧急 × 必要」,**不是**经典的「重要 × 紧急」。
#
# 象限由两轴**派生**,不单独落一列 —— 存了就会有两处状态,迟早不一致。
# 两轴任一为 NULL 即「未分类」;这也让「只分类新增项」有可判定的条件。
# 与既有 priority(P0/P1/P2)是两套语义,并存不改:priority 是「多重」,
# 这里是「多急 × 多必要」,同一个待办两个维度都要看。

URGENCY_VALUES = ("urgent", "not_urgent")
NECESSITY_VALUES = ("necessary", "not_necessary")

# quadrant_source:manual = 用户拖拽/手改,自动分类永不覆盖;llm = 模型判定
QUADRANT_SOURCE_MANUAL = "manual"
QUADRANT_SOURCE_LLM = "llm"

QUADRANT_LABELS = {
    "urgent_necessary": "必要且紧急",
    "urgent_unnecessary": "紧急非必要",
    "necessary_not_urgent": "必要不紧急",
    "neither": "不紧急不必要",
}

_QUADRANT_BY_AXES = {
    ("urgent", "necessary"): "urgent_necessary",
    ("urgent", "not_necessary"): "urgent_unnecessary",
    ("not_urgent", "necessary"): "necessary_not_urgent",
    ("not_urgent", "not_necessary"): "neither",
}


def derive_quadrant(urgency: str | None, necessity: str | None) -> str | None:
    """由两轴派生象限键;任一轴为空即未分类(返回 None)。"""
    if not urgency or not necessity:
        return None
    return _QUADRANT_BY_AXES.get((urgency, necessity))


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
        # 四象限:两轴原值 + 派生象限键(null=未分类)+ 来源 + 判定依据
        "urgency": t.urgency,
        "necessity": t.necessity,
        "quadrant": derive_quadrant(t.urgency, t.necessity),
        "quadrant_source": t.quadrant_source,
        "quadrant_meta": t.quadrant_meta,
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

# action_items 中字段反向映射:与 sync_todos_for_meeting 保持对称,
# 这样回写后再次 sync 也能用 (meeting_id, content) 命中幂等键
_STATUS_TO_ZH = {"pending": "待办", "doing": "进行中", "done": "已完成"}
_PRIORITY_TO_RAW = {"P0": "high", "P1": "medium", "P2": "low"}


async def _write_back_to_meeting(
    todo: ProjectTodo,
    session: AsyncSession,
    *,
    match_content: str | None = None,
) -> None:
    """将待办变更(content / assignee / due_date / priority / status)回写到源会议 meeting_minutes.action_items。

    match_content: 用于在 action_items 里定位条目的 task 字符串。
    当用户编辑了 content 时,调用方必须传入**旧的** content,否则会匹配不到。
    不传则用 todo.content(适用于只改状态等场景)。
    """
    if not todo.meeting_id:
        return
    m = await session.get(Meeting, todo.meeting_id)
    if not m or not m.meeting_minutes:
        return

    key = (match_content if match_content is not None else todo.content).strip()
    mt = dict(m.meeting_minutes)
    items = mt.get("action_items") or []
    changed = False
    for item in items:
        if not isinstance(item, dict):
            continue
        if (item.get("task") or "").strip() != key:
            continue
        item["task"] = todo.content
        item["owner"] = todo.assignee or ""
        item["deadline"] = todo.due_date.isoformat() if todo.due_date else ""
        item["priority"] = _PRIORITY_TO_RAW.get(todo.priority, "medium")
        item["status"] = _STATUS_TO_ZH.get(todo.status, todo.status)
        changed = True
        break
    if changed:
        m.meeting_minutes = mt
        await session.commit()


# ── 四象限自动分类(LLM,可复用) ──────────────────────────────────────

# 每批条数:待办条目短,但要让模型逐条给理由,40 条是输出长度与调用次数的折中
_QUADRANT_BATCH = 40
# 批数上限:防一次请求把上千条待办全打给模型(单次同步不该跑成分钟级)
_QUADRANT_MAX_BATCHES = 8

_EMPTY_QUADRANT: dict = {"classifications": []}


def _quadrant_prompt_item(t: ProjectTodo, today: date) -> dict:
    """把待办压成模型好判的短结构。days_left 是模型判「紧急」最可靠的信号,
    但 prompt 里已明确要求「以内容为准」,避免被假日期带偏。"""
    return {
        "id": t.id,
        "content": t.content,
        "assignee": t.assignee or None,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "days_left": (t.due_date - today).days if t.due_date else None,
        "priority": t.priority,
        "status": t.status,
        "quote": t.source_quote,
    }


async def _classify_one_batch(batch: list[ProjectTodo], today: date) -> tuple[list[dict], str]:
    """单批分类。返回 (classifications, model_used)。失败返回空,不抛。"""
    import json

    import structlog

    from prompts.meeting import QUADRANT_SYSTEM, QUADRANT_USER
    from services.llm_json import loads_lenient
    from services.meeting.pipeline import _json_output_valid
    from services.model_router import model_router

    items = [_quadrant_prompt_item(t, today) for t in batch]
    messages = [
        {"role": "system", "content": QUADRANT_SYSTEM},
        {
            "role": "user",
            "content": QUADRANT_USER.format(
                count=len(items),
                items=json.dumps(items, ensure_ascii=False, indent=1),
            ),
        },
    ]
    try:
        content, model_used = await model_router.chat_with_routing(
            task="meeting_todo_quadrant",
            messages=messages,
            temperature=0.2,
            # validator 不能省:缺了它 JSON 被截断也当成功返回,是 LEARNING §11.10 的静默坑
            validator=_json_output_valid,
            max_tokens=8000,
            response_format={"type": "json_object"},
            extra_payload={"thinking": {"type": "disabled"}},
        )
    except Exception as e:
        structlog.get_logger().warning(
            "quadrant_batch_failed", error=str(e)[:200], batch_size=len(batch)
        )
        return [], ""

    data = loads_lenient(content, None)
    if not isinstance(data, dict):
        structlog.get_logger().warning("quadrant_batch_bad_json", raw=(content or "")[:200])
        return [], model_used

    raw = data.get("classifications")
    rows = [r for r in raw if isinstance(r, dict)] if isinstance(raw, list) else []
    return rows, model_used


async def classify_todos_quadrant(
    project_id: str,
    session: AsyncSession,
    *,
    only_unclassified: bool = True,
    ids: list[int] | None = None,
) -> dict:
    """给项目待办打「紧急 × 必要」两轴,写回 urgency / necessity。

    **绝不覆盖 `quadrant_source='manual'` 的条目** —— 用户拖过的位置是最终意见,
    自动分类只能填空白(验收标准 7)。要让它重新参与自动分类,把它拖回「未分类」
    (清空两轴)即可,那时 source 会被一并清掉。

    only_unclassified=True(默认)  只补两轴不全的 → 供「同步后自动分类新增项」
    only_unclassified=False        重判所有非 manual 的 → 供「重新分类」按钮
    ids                            只处理指定 id(与上面两个条件取交集)
    """
    import asyncio

    import structlog

    stmt = select(ProjectTodo).where(ProjectTodo.project_id == project_id)
    if ids:
        stmt = stmt.where(ProjectTodo.id.in_(ids))
    rows = list((await session.scalars(stmt.order_by(ProjectTodo.id.asc()))).all())

    manual_skipped = 0
    pending: list[ProjectTodo] = []
    for t in rows:
        if t.quadrant_source == QUADRANT_SOURCE_MANUAL:
            manual_skipped += 1
            continue
        if only_unclassified and t.urgency and t.necessity:
            continue
        pending.append(t)

    if not pending:
        return {
            "updated": 0,
            "unclassified": 0,
            "manual_skipped": manual_skipped,
            "considered": len(rows),
            "batches": 0,
            "model": None,
            "truncated": False,
        }

    truncated = len(pending) > _QUADRANT_BATCH * _QUADRANT_MAX_BATCHES
    if truncated:
        pending = pending[: _QUADRANT_BATCH * _QUADRANT_MAX_BATCHES]

    batches = [pending[i : i + _QUADRANT_BATCH] for i in range(0, len(pending), _QUADRANT_BATCH)]
    today = date.today()

    # 各批互不依赖,session 不参与 LLM 调用,可安全并行
    results = await asyncio.gather(*(_classify_one_batch(b, today) for b in batches))

    by_id = {t.id: t for t in pending}
    updated = 0
    unclassified = 0
    model_used = ""
    now = datetime.utcnow()
    for batch, (classifications, model_used_one) in zip(batches, results):
        model_used = model_used or model_used_one
        allowed = {t.id for t in batch}
        for c in classifications:
            try:
                tid = int(c.get("id"))
            except (TypeError, ValueError):
                continue
            # 只认真实存在于本批的 id:模型偶尔会回一个不存在的 id 或串批
            if tid not in allowed:
                continue
            todo = by_id[tid]
            urgency = c.get("urgency")
            necessity = c.get("necessity")
            # 两轴必须都是合法枚举值才落库;模型给 null / 编词一律当「判不了」,
            # 保持未分类 —— 宁可空着,也不要一个编出来的象限
            if urgency not in URGENCY_VALUES or necessity not in NECESSITY_VALUES:
                unclassified += 1
                continue
            reason = c.get("reason")
            confidence = c.get("confidence")
            todo.urgency = urgency
            todo.necessity = necessity
            todo.quadrant_source = QUADRANT_SOURCE_LLM
            todo.quadrant_meta = {
                "reason": reason if isinstance(reason, str) else "",
                "confidence": confidence if isinstance(confidence, (int, float)) else None,
                "model": model_used_one or "",
                "at": now.isoformat(),
            }
            updated += 1

    if updated:
        await session.commit()

    if updated or unclassified:
        structlog.get_logger().info(
            "quadrant_classified",
            project_id=project_id,
            updated=updated,
            unclassified=unclassified,
            manual_skipped=manual_skipped,
            model=model_used,
        )

    return {
        "updated": updated,
        "unclassified": unclassified,
        "manual_skipped": manual_skipped,
        "considered": len(pending),
        "batches": len(batches),
        "model": model_used or None,
        "truncated": truncated,
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
    classify: bool = True,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """从项目下所有会议导入待办。

    `classify=True`(默认)时,导入完**异步**触发四象限分类(只补新增的未分类项)——
    分类要调 LLM,不能让用户在这条同步请求上干等;结果由前端轮询待办列表拿到。
    分类失败不影响导入结果,新待办会停在「未分类」区,用户可手动拖或点重新分类。
    """
    result = await sync_todos_for_project(project_id, session)

    classify_task_id: str | None = None
    if classify and result.get("imported"):
        try:
            from tasks.insight_tasks import classify_project_todos_quadrant

            classify_task_id = classify_project_todos_quadrant.delay(
                project_id, True
            ).id
        except Exception:
            # broker 不可用等:不让它把已成功的导入变成 500
            import structlog

            structlog.get_logger().warning(
                "quadrant_autoclassify_dispatch_failed", project_id=project_id, exc_info=True
            )

    return {**result, "classify_task_id": classify_task_id}


# ── POST /api/projects/{project_id}/todos/classify ───────────────────

@router.post("/projects/{project_id}/todos/classify")
async def classify_todos(
    project_id: str,
    body: ClassifyIn | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_project_access("write")),
):
    """同步重判四象限(用户点「重新分类」时用,想要即时反馈)。

    默认 `only_unclassified=False` —— 手动点重判的语义就是「把已分类的也重看一遍」,
    但这**不会**动 `quadrant_source='manual'` 的条目(用户拖过的是最终意见)。
    想让它参与重判,把它拖回「未分类」区。
    """
    opts = body or ClassifyIn()
    return await classify_todos_quadrant(
        project_id,
        session,
        only_unclassified=opts.only_unclassified,
        ids=opts.ids,
    )


# ── GET /api/projects/{project_id}/todos/classify/status/{task_id} ───

@router.get("/projects/{project_id}/todos/classify/status/{task_id}")
async def classify_todos_status(
    project_id: str,
    task_id: str,
    user: User = Depends(require_project_access("read")),
):
    """轮询异步分类任务(供同步后自动分类的那条路径)。"""
    from celery.result import AsyncResult

    from tasks.convert_task import celery_app

    res = AsyncResult(task_id, app=celery_app)
    state = res.state
    payload: dict = {"state": state}
    if state == "SUCCESS":
        r = res.result
        payload["result"] = r if isinstance(r, dict) else {"updated": 0}
    elif state == "FAILURE":
        payload["error"] = str(res.result)[:300] if res.result else "分类失败"
    return payload


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

    # 快照旧值:回写会议纪要时用旧 content 匹配 action_item;
    # 任一可写字段变化都需要触发回写,因此这里也快照其他字段做对比
    old_content = todo.content
    old_assignee = todo.assignee
    old_due_date = todo.due_date
    old_priority = todo.priority
    old_status = todo.status

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

    # 四象限两轴:用户手改一律标 manual,自动分类从此不再碰它(验收标准 7)。
    # 清空两轴 → 回到未分类,source 一并清掉,否则会留个「manual 但没象限」的怪状态。
    quadrant_touched = False
    if body.urgency is not None:
        if body.urgency == "":
            todo.urgency = None
        elif body.urgency in URGENCY_VALUES:
            todo.urgency = body.urgency
        else:
            raise HTTPException(400, f"urgency 需为 {'/'.join(URGENCY_VALUES)} 或空串")
        quadrant_touched = True
    if body.necessity is not None:
        if body.necessity == "":
            todo.necessity = None
        elif body.necessity in NECESSITY_VALUES:
            todo.necessity = body.necessity
        else:
            raise HTTPException(400, f"necessity 需为 {'/'.join(NECESSITY_VALUES)} 或空串")
        quadrant_touched = True
    if quadrant_touched:
        if derive_quadrant(todo.urgency, todo.necessity):
            todo.quadrant_source = QUADRANT_SOURCE_MANUAL
            todo.quadrant_meta = None
        else:
            todo.quadrant_source = None
            todo.quadrant_meta = None

    todo.updated_at = datetime.utcnow()
    await session.commit()

    # 任一可写字段变化都回写会议纪要,保住 sync 幂等键
    if (
        todo.content != old_content
        or todo.assignee != old_assignee
        or todo.due_date != old_due_date
        or todo.priority != old_priority
        or todo.status != old_status
    ):
        await _write_back_to_meeting(todo, session, match_content=old_content)

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
    dirty: list[ProjectTodo] = []
    for todo in todos:
        changed = False
        if body.status:
            if body.status not in ("pending", "doing", "done"):
                continue
            # 依赖检查
            if body.status == "done" and todo.blocked_by:
                blocker = await session.get(ProjectTodo, todo.blocked_by)
                if blocker and blocker.status != "done":
                    continue
            if todo.status != body.status:
                todo.status = body.status
                changed = True
        if body.assignee is not None and todo.assignee != body.assignee:
            todo.assignee = body.assignee
            changed = True
        if body.priority and body.priority in ("P0", "P1", "P2") and todo.priority != body.priority:
            todo.priority = body.priority
            changed = True
        todo.updated_at = datetime.utcnow()
        updated += 1
        if changed and todo.meeting_id:
            dirty.append(todo)

    await session.commit()

    # 批量改完后回写会议纪要(batch 不改 content,直接用当前 content 匹配即可)
    for todo in dirty:
        await _write_back_to_meeting(todo, session)

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
