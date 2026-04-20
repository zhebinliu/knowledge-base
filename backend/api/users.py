"""用户管理 API（管理员）：列表、修改 is_admin/is_active、重置密码、删除。"""
import secrets
import string

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.user import User
from services.auth import hash_password, require_admin

logger = structlog.get_logger()
router = APIRouter(dependencies=[Depends(require_admin)])


def _user_dto(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "full_name": u.full_name,
        "is_admin": u.is_admin,
        "is_active": u.is_active,
        "must_change_password": u.must_change_password,
        "sso_provider": u.sso_provider,
        "allowed_modules": u.allowed_modules,
        "created_at": u.created_at,
        "last_login_at": u.last_login_at,
    }


def _generate_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


async def _count_active_admins(session: AsyncSession, exclude_id: str | None = None) -> int:
    stmt = select(func.count()).select_from(User).where(
        User.is_admin == True, User.is_active == True  # noqa: E712
    )
    if exclude_id:
        stmt = stmt.where(User.id != exclude_id)
    return await session.scalar(stmt) or 0


@router.get("")
async def list_users(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(User).order_by(User.created_at.asc()))
    return [_user_dto(u) for u in result.scalars().all()]


@router.post("", status_code=201)
async def create_user(
    payload: UserCreate,
    current: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    existing = await session.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(400, "用户名已存在")
    raw_password = payload.password or _generate_password()
    user = User(
        username=payload.username,
        full_name=payload.full_name,
        email=payload.email,
        is_admin=payload.is_admin,
        password_hash=hash_password(raw_password),
        must_change_password=not bool(payload.password),  # 自动生成密码时强制改密
        allowed_modules=payload.allowed_modules,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    logger.info("user_created", admin=current.username, new_user=user.username)
    return {**_user_dto(user), "initial_password": raw_password if not payload.password else None}


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    full_name: str | None = None
    email: str | None = None
    is_admin: bool = False
    allowed_modules: list[str] | None = None  # None = 全部


_UNSET = object()

class UserPatch(BaseModel):
    is_admin: bool | None = None
    is_active: bool | None = None
    full_name: str | None = None
    email: str | None = None
    allowed_modules: list[str] | None = None  # None = 全部；通过 model_fields_set 判断是否修改


@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    payload: UserPatch,
    current: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")

    # 防止把自己降级或禁用，导致没人能管理系统
    if user.id == current.id:
        if payload.is_admin is False:
            raise HTTPException(400, "不能取消自己的管理员权限")
        if payload.is_active is False:
            raise HTTPException(400, "不能禁用自己")

    # 防止把最后一个活跃管理员降级/禁用
    if (
        (payload.is_admin is False and user.is_admin)
        or (payload.is_active is False and user.is_admin and user.is_active)
    ):
        remaining = await _count_active_admins(session, exclude_id=user.id)
        if remaining < 1:
            raise HTTPException(400, "系统至少保留一个活跃管理员")

    if payload.is_admin is not None:
        user.is_admin = payload.is_admin
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.email is not None:
        user.email = payload.email
    if "allowed_modules" in payload.model_fields_set:
        user.allowed_modules = payload.allowed_modules

    await session.commit()
    logger.info("user_updated", admin=current.username, target=user.username)
    return _user_dto(user)


class ResetPasswordIn(BaseModel):
    new_password: str | None = Field(default=None, min_length=6, max_length=128)


@router.post("/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    payload: ResetPasswordIn,
    current: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")

    new_password = payload.new_password or _generate_password()
    user.password_hash = hash_password(new_password)
    user.must_change_password = True
    await session.commit()
    logger.info("user_password_reset", admin=current.username, target=user.username)
    # 仅在管理员未自定义密码时返回随机密码，方便分发
    return {
        "ok": True,
        "must_change_password": True,
        "new_password": new_password if not payload.new_password else None,
    }


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    current: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    if user.id == current.id:
        raise HTTPException(400, "不能删除自己")
    if user.is_admin and user.is_active:
        remaining = await _count_active_admins(session, exclude_id=user.id)
        if remaining < 1:
            raise HTTPException(400, "系统至少保留一个活跃管理员")
    await session.delete(user)
    await session.commit()
    logger.info("user_deleted", admin=current.username, target=user.username)
    return {"ok": True}
