"""认证 API：register / login / me / change-password / SSO 占位。"""
import secrets
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
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
from services.rate_limit import limiter

logger = structlog.get_logger()
router = APIRouter()


from services._time import utcnow_naive as _utcnow_naive


def _user_dto(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "full_name": u.full_name,
        "is_admin": u.is_admin,
        "role": u.role or ("admin" if u.is_admin else "console_user"),
        "is_active": u.is_active,
        "must_change_password": u.must_change_password,
        "sso_provider": u.sso_provider,
        "allowed_modules": u.allowed_modules,
        "api_enabled": u.api_enabled,
        "created_at": u.created_at,
        "last_login_at": u.last_login_at,
    }


# ── Schemas ──────────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    email: str | None = None
    full_name: str | None = None
    # 可选角色；默认 console_user（对外工作台）。admin 角色只能由管理员后台手动创建
    role: str | None = None


class LoginIn(BaseModel):
    username: str
    password: str


class ChangePasswordIn(BaseModel):
    old_password: str | None = None  # must_change_password=True 时可不填
    new_password: str = Field(min_length=6, max_length=128)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/register")
@limiter.limit("5/minute")
async def register(request: Request, payload: RegisterIn, session: AsyncSession = Depends(get_session)):
    existing = await session.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(409, "用户名已存在")
    # 默认注册角色为 console_user；忽略客户端传入的 "admin" 以防越权（admin 只能后台手动建）
    requested_role = (payload.role or "console_user").strip().lower()
    role = requested_role if requested_role in ("console_user",) else "console_user"
    user = User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_admin=False,
        role=role,
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
@limiter.limit("5/minute")
async def login(request: Request, payload: LoginIn, session: AsyncSession = Depends(get_session)):
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


@router.post("/refresh")
async def refresh_token(user: User = Depends(get_current_user)):
    """用当前有效 token 换一个新的 7 天 token（无需重新输密码）。"""
    token = create_access_token(user.id)
    logger.info("token_refreshed", user_id=user.id, username=user.username)
    return {"access_token": token, "token_type": "bearer"}


@router.post("/mcp-key")
async def generate_mcp_key(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """生成（或轮换）当前用户的 MCP API Key。返回完整 key，仅本次可见。需管理员授权 api_enabled。"""
    if not user.api_enabled:
        raise HTTPException(403, "未获得 API/MCP 调用授权，请联系管理员开启")
    key = "mcp_" + secrets.token_hex(24)   # 52 chars total
    user.mcp_api_key = key
    await session.commit()
    logger.info("mcp_key_generated", user_id=user.id, username=user.username)
    return {"mcp_api_key": key}


@router.get("/mcp-key")
async def get_mcp_key_status(user: User = Depends(get_current_user)):
    """返回当前 MCP Key 是否已设置（脱敏）。"""
    if not user.mcp_api_key:
        return {"has_key": False, "preview": None}
    k = user.mcp_api_key
    preview = k[:8] + "…" + k[-4:]
    return {"has_key": True, "preview": preview}


@router.delete("/mcp-key", status_code=204)
async def revoke_mcp_key(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """撤销当前用户的 MCP API Key。"""
    user.mcp_api_key = None
    await session.commit()
    logger.info("mcp_key_revoked", user_id=user.id, username=user.username)


@router.post("/sso/{provider}/bind", status_code=501)
async def sso_bind(provider: str):
    """SSO 绑定占位：仅声明契约，未实装。"""
    raise HTTPException(
        status_code=501,
        detail=f"SSO provider '{provider}' 暂未实装，仅占位。后续支持企业微信/钉钉/OIDC。",
    )
