"""认证 API：register / login / me / change-password / SSO 占位 / captcha / invite-code。"""
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
from services.security.password_policy import validate_password_strength
from services.security.captcha import generate_captcha, verify_captcha
from services.security.invite_code import validate_and_consume as consume_invite_code

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
    password: str = Field(min_length=10, max_length=128)
    email: str | None = None
    full_name: str | None = None
    invite_code: str = Field(min_length=8, max_length=32, description="邀请码 — 必填")
    captcha_id: str = Field(description="GET /api/auth/captcha 拿到的 id")
    captcha_answer: str = Field(min_length=1, max_length=20, description="用户从图里看到的字符")


class LoginIn(BaseModel):
    username: str
    password: str
    captcha_id: str | None = None       # 兼容老前端先标 optional,前端发版后再硬要求
    captcha_answer: str | None = None


class ChangePasswordIn(BaseModel):
    old_password: str | None = None  # must_change_password=True 时可不填
    new_password: str = Field(min_length=10, max_length=128)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/captcha")
@limiter.limit("60/minute")
async def get_captcha(request: Request, session: AsyncSession = Depends(get_session)):
    """生成新的图形验证码挑战。返回 captcha_id + base64 PNG data URL。
    前端展示 PNG,用户输入后跟 captcha_id 一起提交到 register / login。
    """
    captcha_id, image_b64 = await generate_captcha(session)
    return {"captcha_id": captcha_id, "image_b64": image_b64}


@router.post("/register")
@limiter.limit("5/minute")
async def register(request: Request, payload: RegisterIn, session: AsyncSession = Depends(get_session)):
    # 1. 验证图形验证码(优先,挡住暴力试用户名 / 试邀请码的爬虫)
    ok, err = await verify_captcha(session, payload.captcha_id, payload.captcha_answer)
    if not ok:
        raise HTTPException(400, err)

    # 2. 验证密码强度
    pw_ok, pw_err = validate_password_strength(payload.password, username=payload.username)
    if not pw_ok:
        raise HTTPException(400, pw_err)

    # 3. 用户名冲突检查
    existing = await session.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(409, "用户名已存在")

    # 4. 验证 + 消费邀请码(atomic 写库;失败不创建用户,但 captcha 已被消费,需重拉)
    ic, ic_err = await consume_invite_code(session, payload.invite_code)
    if ic_err or ic is None:
        raise HTTPException(400, ic_err or "邀请码无效")

    # 5. 创建账号 — role 由邀请码决定(管理员邀请码可注出 admin 账号)
    role = ic.target_role if ic.target_role in ("console_user", "admin") else "console_user"
    is_admin = (role == "admin")
    user = User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_admin=is_admin,
        role=role,
        is_active=True,
        must_change_password=False,
        api_enabled=is_admin,
        signed_up_via_invite_code=ic.code,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    token = create_access_token(user.id)
    logger.info("user_registered", user_id=user.id, username=user.username,
                role=role, invite_code=ic.code)
    return {"access_token": token, "token_type": "bearer", "user": _user_dto(user)}


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, payload: LoginIn, session: AsyncSession = Depends(get_session)):
    # 验证图形验证码 — 部署过渡期:传了就验证,没传暂时允许;前端全量升级后改硬要求
    if payload.captcha_id or payload.captcha_answer:
        ok, err = await verify_captcha(session, payload.captcha_id or "", payload.captcha_answer or "")
        if not ok:
            raise HTTPException(400, err)

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
    # 新密码强度校验
    pw_ok, pw_err = validate_password_strength(payload.new_password, username=user.username)
    if not pw_ok:
        raise HTTPException(400, pw_err)
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
