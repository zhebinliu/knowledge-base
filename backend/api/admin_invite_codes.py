"""管理员后台:邀请码 CRUD。仅 is_admin=True 用户可访问。"""
from datetime import datetime
from typing import Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.user import User
from services.auth import get_current_user
from services.security.invite_code import (
    create_invite_code,
    list_invite_codes,
    revoke_invite_code,
    status_of,
    VALID_TARGET_ROLES,
)

logger = structlog.get_logger()
router = APIRouter()


def _ensure_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(403, "仅管理员可访问邀请码管理")


def _ic_dto(ic) -> dict:
    return {
        "id": ic.id,
        "code": ic.code,
        "created_by": ic.created_by,
        "max_uses": ic.max_uses,
        "used_count": ic.used_count,
        "expires_at": ic.expires_at.isoformat() if ic.expires_at else None,
        "target_role": ic.target_role,
        "revoked": ic.revoked,
        "note": ic.note,
        "status": status_of(ic),
        "created_at": ic.created_at.isoformat() if ic.created_at else None,
        "updated_at": ic.updated_at.isoformat() if ic.updated_at else None,
    }


class CreateInviteCodeIn(BaseModel):
    max_uses: int = Field(default=1, ge=0, le=10000, description="0 = 无限")
    expires_in_days: int = Field(default=7, ge=0, le=3650, description="0 = 永久")
    target_role: Literal["console_user", "admin"] = "console_user"
    note: str | None = Field(default=None, max_length=255)


@router.post("/invite-codes")
async def create_code(
    payload: CreateInviteCodeIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(user)
    if payload.target_role not in VALID_TARGET_ROLES:
        raise HTTPException(400, "target_role 仅允许 console_user / admin")
    ic = await create_invite_code(
        session,
        created_by=user.id,
        max_uses=payload.max_uses,
        expires_in_days=payload.expires_in_days,
        target_role=payload.target_role,
        note=payload.note,
    )
    logger.info("invite_code_created", code_id=ic.id, code=ic.code, by=user.username,
                max_uses=ic.max_uses, expires_at=str(ic.expires_at), target_role=ic.target_role)
    return _ic_dto(ic)


@router.get("/invite-codes")
async def list_codes(
    limit: int = 100,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(user)
    rows = await list_invite_codes(session, limit=limit)
    return {"items": [_ic_dto(r) for r in rows]}


@router.post("/invite-codes/{ic_id}/revoke")
async def revoke_code(
    ic_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(user)
    ic = await revoke_invite_code(session, ic_id)
    if not ic:
        raise HTTPException(404, "邀请码不存在")
    logger.info("invite_code_revoked", code_id=ic.id, code=ic.code, by=user.username)
    return _ic_dto(ic)
