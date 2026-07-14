"""会议涉及场景 API（闭环③）。挂 /api：

- GET  /api/meetings/{meeting_id}/scenes         本场已识别的涉及场景(纳入/移出),未识别返回 detected=false
- POST /api/meetings/{meeting_id}/scenes/detect  现跑一次识别并落库,返回结果

单独放主仓 api（不进 meeting overlay),避免覆盖冲突。
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.meeting import Meeting
from models.meeting_scene import MeetingSceneDelta
from models.user import User
from services.auth import get_current_user
from services.project_acl import assert_project_access

logger = structlog.get_logger()
router = APIRouter()


class MeetingScenesDto(BaseModel):
    meeting_id: int
    detected: bool
    in_scope: list = []
    out_of_scope: list = []
    detected_at: str | None = None
    stale: bool = False        # 纪要在识别后又变过 → 建议重识别


async def _access(meeting: Meeting, user: User, session: AsyncSession) -> None:
    """会议访问校验:有项目则走项目读权限;无项目则限本人或管理员。"""
    if meeting.project_id:
        await assert_project_access(user, meeting.project_id, "read")
    elif meeting.owner_id != user.id and getattr(user, "role", "") != "admin":
        raise HTTPException(403, "无权访问该会议")


@router.get("/meetings/{meeting_id}/scenes", response_model=MeetingScenesDto)
async def get_meeting_scenes(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meeting = await session.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(404, "会议不存在")
    await _access(meeting, current_user, session)

    row = (await session.execute(
        select(MeetingSceneDelta).where(MeetingSceneDelta.meeting_id == meeting_id)
    )).scalar_one_or_none()
    if row is None:
        return MeetingScenesDto(meeting_id=meeting_id, detected=False)

    from services.scene_meeting import minutes_fingerprint
    stale = bool(row.minutes_hash and row.minutes_hash != minutes_fingerprint(meeting))
    return MeetingScenesDto(
        meeting_id=meeting_id, detected=True,
        in_scope=row.in_scope or [], out_of_scope=row.out_of_scope or [],
        detected_at=row.detected_at.isoformat() if row.detected_at else None,
        stale=stale,
    )


@router.post("/meetings/{meeting_id}/scenes/detect", response_model=MeetingScenesDto)
async def detect_meeting_scenes_api(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meeting = await session.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(404, "会议不存在")
    await _access(meeting, current_user, session)

    from services.scene_meeting import detect_meeting_scenes
    r = await detect_meeting_scenes(meeting_id, session, detected_by=current_user.username)
    return MeetingScenesDto(
        meeting_id=meeting_id, detected=True,
        in_scope=r.get("in_scope", []), out_of_scope=r.get("out_of_scope", []),
        detected_at=r.get("detected_at"), stale=False,
    )
