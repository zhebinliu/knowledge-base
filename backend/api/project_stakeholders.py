"""项目级干系人资产 API(2026-05-12)。

routes:
  GET    /api/projects/{pid}/stakeholders          列表
  POST   /api/projects/{pid}/stakeholders          新增空人物
  PATCH  /api/projects/{pid}/stakeholders/{sid}    编辑(改名 → 跨该 project
                                                   所有 meeting 同步引用)
  DELETE /api/projects/{pid}/stakeholders/{sid}    删除
  POST   /api/projects/{pid}/stakeholders/sync-from-meeting/{mid}
         合并 meeting.stakeholder_map → project_stakeholders
         (name / alias 重叠的合并;不重叠的新增)
"""
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.meeting import Meeting
from models.project_stakeholder import ProjectStakeholder
from models.user import User
from services.auth import get_current_user
from services.project_acl import assert_project_access

logger = structlog.get_logger()
router = APIRouter()


# ── DTOs ────────────────────────────────────────────────────────────────

class StakeholderIn(BaseModel):
    name: str
    aliases: list[str] = []
    role: str = ""
    organization: str = ""
    side: str = "unknown"
    contact: str = ""
    key_points: list[str] = []
    responsibilities: list[str] = []


class StakeholderPatch(BaseModel):
    name: Optional[str] = None
    aliases: Optional[list[str]] = None
    role: Optional[str] = None
    organization: Optional[str] = None
    side: Optional[str] = None
    contact: Optional[str] = None
    key_points: Optional[list[str]] = None
    responsibilities: Optional[list[str]] = None


def _dto(s: ProjectStakeholder) -> dict:
    return {
        "id": s.id,
        "project_id": s.project_id,
        "name": s.name,
        "aliases": s.aliases or [],
        "role": s.role,
        "organization": s.organization,
        "side": s.side,
        "contact": s.contact,
        "key_points": s.key_points or [],
        "responsibilities": s.responsibilities or [],
        "source_meeting_ids": s.source_meeting_ids or [],
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


# ── endpoints ───────────────────────────────────────────────────────────

@router.get("")
async def list_project_stakeholders(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await assert_project_access(user, project_id, "read")
    rows = (await session.scalars(
        select(ProjectStakeholder)
        .where(ProjectStakeholder.project_id == project_id)
        .order_by(ProjectStakeholder.name)
    )).all()
    return {"stakeholders": [_dto(s) for s in rows]}


@router.post("", status_code=201)
async def create_project_stakeholder(
    project_id: str,
    body: StakeholderIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await assert_project_access(user, project_id, "write")
    # 同名校验
    exist = await session.scalar(
        select(ProjectStakeholder).where(
            ProjectStakeholder.project_id == project_id,
            sa_func.lower(ProjectStakeholder.name) == body.name.strip().lower(),
        )
    )
    if exist:
        raise HTTPException(409, f"项目内已存在干系人「{body.name}」,请直接编辑")
    s = ProjectStakeholder(
        project_id=project_id,
        name=body.name.strip(),
        aliases=body.aliases,
        role=body.role,
        organization=body.organization,
        side=body.side or "unknown",
        contact=body.contact,
        key_points=body.key_points,
        responsibilities=body.responsibilities,
        source_meeting_ids=[],
    )
    session.add(s)
    await session.commit()
    await session.refresh(s)
    return _dto(s)


@router.patch("/{stakeholder_id}")
async def patch_project_stakeholder(
    project_id: str,
    stakeholder_id: str,
    body: StakeholderPatch,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """编辑人物。如果改了 name,同步到该 project 所有 meeting 的引用。"""
    await assert_project_access(user, project_id, "write")
    s = await session.get(ProjectStakeholder, stakeholder_id)
    if not s or s.project_id != project_id:
        raise HTTPException(404, "干系人不存在或不属于该项目")

    old_name = s.name
    old_aliases = list(s.aliases or [])

    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(s, k, v)
    await session.commit()
    await session.refresh(s)

    # 改名 → 同步该 project 所有 meeting
    sync_summary = {"meetings_synced": 0, "minutes_replaced": 0, "requirements_replaced": 0}
    if body.name and body.name != old_name:
        # 找该项目所有 meeting
        meeting_ids = (await session.scalars(
            select(Meeting.id).where(Meeting.project_id == project_id)
        )).all()
        # 复用 meeting/rename 端点的同名逻辑(直接调用同进程函数)
        from api.meeting import StakeholderRenamePayload, rename_stakeholder_references
        for mid in meeting_ids:
            try:
                result = await rename_stakeholder_references(
                    meeting_id=mid,
                    body=StakeholderRenamePayload(
                        old_name=old_name,
                        new_name=body.name,
                        old_aliases=old_aliases,
                    ),
                    session=session,
                    user=user,
                )
                if result["replaced_in_minutes"] or result["replaced_in_requirements"]:
                    sync_summary["meetings_synced"] += 1
                    sync_summary["minutes_replaced"] += result["replaced_in_minutes"]
                    sync_summary["requirements_replaced"] += result["replaced_in_requirements"]
            except Exception as e:
                logger.warning("rename_sync_failed", meeting_id=mid, error=str(e)[:120])

    return {"stakeholder": _dto(s), "sync": sync_summary}


@router.delete("/{stakeholder_id}", status_code=204)
async def delete_project_stakeholder(
    project_id: str,
    stakeholder_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await assert_project_access(user, project_id, "write")
    s = await session.get(ProjectStakeholder, stakeholder_id)
    if not s or s.project_id != project_id:
        raise HTTPException(404, "干系人不存在或不属于该项目")
    await session.delete(s)
    await session.commit()
    return None


@router.post("/sync-from-meeting/{meeting_id}")
async def sync_from_meeting(
    project_id: str,
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """把 meeting.stakeholder_map.stakeholders 合并到 project_stakeholders。

    合并策略:
    - 同名(忽略大小写)或 alias 重叠 → 合并到现有 record(aliases/key_points/
      responsibilities 累加去重,role/organization/side/contact 若现有为空则填充)
    - 不重叠 → 新建 record
    - 关联 source_meeting_ids 加上当前 meeting_id
    """
    await assert_project_access(user, project_id, "write")

    m = await session.get(Meeting, meeting_id)
    if not m:
        raise HTTPException(404, "会议不存在")
    if m.project_id != project_id:
        raise HTTPException(400, "该会议未关联到此项目")

    stakes = (m.stakeholder_map or {}).get("stakeholders") or []
    if not stakes:
        return {"created": 0, "merged": 0, "total": 0}

    # 拉项目现有
    existing = (await session.scalars(
        select(ProjectStakeholder).where(ProjectStakeholder.project_id == project_id)
    )).all()

    def _match(incoming: dict) -> Optional[ProjectStakeholder]:
        in_name = (incoming.get("name") or "").strip()
        in_aliases = {a.strip() for a in (incoming.get("aliases") or []) if a}
        for ps in existing:
            if (ps.name or "").lower() == in_name.lower():
                return ps
            # alias 交集
            ps_aliases = set(ps.aliases or [])
            ps_aliases.add(ps.name)
            if in_aliases & ps_aliases:
                return ps
            if in_name in ps_aliases:
                return ps
        return None

    def _merge_list(a: list | None, b: list | None) -> list:
        seen = set()
        out = []
        for x in (a or []) + (b or []):
            if x and x not in seen:
                seen.add(x)
                out.append(x)
        return out

    created, merged = 0, 0
    for incoming in stakes:
        if not isinstance(incoming, dict):
            continue
        in_name = (incoming.get("name") or "").strip()
        if not in_name:
            continue

        match = _match(incoming)
        if match:
            # 合并字段(空字段才覆盖,数组累加去重)
            match.aliases = _merge_list(match.aliases, incoming.get("aliases"))
            # 合并 alias 时把对方的 name 也加进 alias(如果不同)
            if in_name != match.name and in_name not in (match.aliases or []):
                match.aliases = (match.aliases or []) + [in_name]
            match.key_points = _merge_list(match.key_points, incoming.get("key_points"))
            match.responsibilities = _merge_list(match.responsibilities, incoming.get("responsibilities"))
            if not match.role and incoming.get("role"):
                match.role = incoming["role"]
            if not match.organization and incoming.get("organization"):
                match.organization = incoming["organization"]
            if match.side == "unknown" and incoming.get("side"):
                match.side = incoming["side"]
            if not match.contact and incoming.get("contact"):
                match.contact = incoming["contact"]
            # 记录来源 meeting
            sids = list(match.source_meeting_ids or [])
            if meeting_id not in sids:
                sids.append(meeting_id)
                match.source_meeting_ids = sids
            merged += 1
        else:
            ps = ProjectStakeholder(
                project_id=project_id,
                name=in_name,
                aliases=list(incoming.get("aliases") or []),
                role=incoming.get("role") or "",
                organization=incoming.get("organization") or "",
                side=incoming.get("side") or "unknown",
                contact=incoming.get("contact") or "",
                key_points=list(incoming.get("key_points") or []),
                responsibilities=list(incoming.get("responsibilities") or []),
                source_meeting_ids=[meeting_id],
            )
            session.add(ps)
            existing.append(ps)  # 后续 _match 也能看到
            created += 1

    await session.commit()
    logger.info("sync_stakeholders_to_project",
                project_id=project_id, meeting_id=meeting_id,
                created=created, merged=merged, total=len(stakes))
    return {"created": created, "merged": merged, "total": len(stakes)}
