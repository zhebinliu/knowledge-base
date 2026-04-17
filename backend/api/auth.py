"""认证 API：register / login / me / change-password / SSO 占位。"""
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.user import User
from services.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)

logger = structlog.get_logger()
router = APIRouter()


def _utcnow_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


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
        "created_at": u.created_at,
        "last_login_at": u.last_login_at,
    }


# ── Schemas ──────────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    email: str | None = None
    full_name: str | None = None


class LoginIn(BaseModel):
    username: str
    password: str


class ChangePasswordIn(BaseModel):
    old_password: str | None = None  # must_change_password=True 时可不填
    new_password: str = Field(min_length=6, max_length=128)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/register")
async def register(payload: RegisterIn, session: AsyncSession = Depends(get_session)):
    existing = await session.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(409, "用户名已存在")
    user = User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_admin=False,
        is_active=True,
        must_change_password=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    token = create_access_token(user.id)
    logger.info("user_registered", user_id=user.id, username=user.username)
    return {"access_token": token, "token_type": "bearer", "user": _user_dto(user)}


@router.post("/login")
async def login(payload: LoginIn, session: AsyncSession = Depends(get_session)):
    user = await session.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.password_hash or ""):
        raise HTTPException(401, "用户名或密码错误")
    if not user.is_active:
        raise HTTPException(403, "账号已禁用")
    user.last_login_at = _utcnow_naive()
    await session.commit()
    await session.refresh(user)
    token = create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer", "user": _user_dto(user)}


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return _user_dto(user)


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # 强制改密时允许跳过 old_password；其他情况必须验证旧密码
    if not user.must_change_password:
        if not payload.old_password:
            raise HTTPException(400, "请输入当前密码")
        if not verify_password(payload.old_password, user.password_hash or ""):
            raise HTTPException(401, "当前密码错误")
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    await session.commit()
    return {"ok": True}


@router.post("/sso/{provider}/bind", status_code=501)
async def sso_bind(provider: str):
    """SSO 绑定占位：仅声明契约，未实装。"""
    raise HTTPException(
        status_code=501,
        detail=f"SSO provider '{provider}' 暂未实装，仅占位。后续支持企业微信/钉钉/OIDC。",
    )
