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


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> User:
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(401, "未登录")
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
    """用于上传等接口：登录时记录 uploader，未登录时不阻断（保留向后兼容）。"""
    token = _extract_bearer_token(request)
    if not token:
        return None
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
        )
        session.add(admin)
        await session.commit()
        logger.warning(
            "admin_seeded",
            username=settings.admin_initial_username,
            note="首次登录后请立即修改密码",
        )
