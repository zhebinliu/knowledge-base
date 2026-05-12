"""认证服务：bcrypt 密码 hash + PyJWT token + FastAPI 依赖。"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
import structlog
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import get_session
from models.user import User

logger = structlog.get_logger()


# ── Password ─────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(user_id: str, extra: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expire_minutes)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


# ── FastAPI dependencies ──────────────────────────────────────────────────────

def _extract_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    return auth.split(" ", 1)[1].strip() or None


async def _user_from_mcp_key(session: AsyncSession, token: str) -> Optional[User]:
    """MCP API Key 形如 mcp_xxx，查 users.mcp_api_key 映射到用户。"""
    if not token.startswith("mcp_"):
        return None
    user = await session.scalar(select(User).where(User.mcp_api_key == token))
    return user if user and user.is_active and user.api_enabled else None


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> User:
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(401, "未登录")

    # 支持 MCP API Key 走 REST
    mcp_user = await _user_from_mcp_key(session, token)
    if mcp_user:
        return mcp_user

    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "登录已过期，请重新登录")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "无效的登录凭证")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "无效的登录凭证")

    user = await session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "用户不存在或已禁用")
    return user


async def get_current_user_optional(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Optional[User]:
    """用于上传等接口：登录时记录 uploader，未登录时不阻断（保留向后兼容）。
    同时接受 JWT 和 MCP API Key（mcp_xxx），方便外部脚本/集成。
    """
    token = _extract_bearer_token(request)
    if not token:
        return None

    mcp_user = await _user_from_mcp_key(session, token)
    if mcp_user:
        return mcp_user

    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    user = await session.get(User, user_id)
    return user if user and user.is_active else None


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(403, "需要管理员权限")
    return user


def require_module(module_name: str):
    """Depends 工厂:确保用户有访问指定模块的权限(细粒度后台权限)。

    规则:
    - `is_admin=True` 一律放行
    - `allowed_modules=None` 视为「全部模块开放」(默认值,向后兼容)
    - 否则检查 `allowed_modules` 是否包含指定模块名

    模块清单见前端 ALL_MODULES:
      后台:dashboard / projects / documents / chunks / qa / review / challenge / settings
      前台:console

    2026-05-12 加:把"细粒度模块权限"从前端 nav 显隐延伸到后端 API 鉴权层,
    防止有权限的用户绕过 UI 直接调 API。
    """
    async def _check(user: User = Depends(get_current_user)) -> User:
        if user.is_admin:
            return user
        if user.allowed_modules is None:
            return user
        if module_name not in user.allowed_modules:
            raise HTTPException(
                403,
                f"未获得「{module_name}」模块授权,请联系管理员开启",
            )
        return user

    return _check


# ── Seed admin on startup ─────────────────────────────────────────────────────

async def seed_admin_if_empty() -> None:
    from models import async_session_maker
    async with async_session_maker() as session:
        existing = await session.scalar(select(User).limit(1))
        if existing is not None:
            return
        admin = User(
            username=settings.admin_initial_username,
            full_name="系统管理员",
            password_hash=hash_password(settings.admin_initial_password),
            is_admin=True,
            is_active=True,
            must_change_password=True,
            api_enabled=True,
        )
        session.add(admin)
        await session.commit()
        logger.warning(
            "admin_seeded",
            username=settings.admin_initial_username,
            note="首次登录后请立即修改密码",
        )
