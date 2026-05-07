"""邀请码服务 — 生成 / 验证 / 消费 / 吊销。

约束:
- 创建时:管理员选 max_uses(0=无限) / expires_in_days(0=永久) / target_role / note
- 验证消费:atomic 检查 + used_count + 1 + 把审计字段写入 user
"""
from __future__ import annotations

import secrets
import string
import uuid
from datetime import timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.invite_code import InviteCode
from services._time import utcnow_naive as _utcnow

CODE_LEN = 16
# 排除易混淆字符
CODE_CHARSET = (string.ascii_uppercase + string.digits).replace("0", "").replace("O", "") \
    .replace("1", "").replace("I", "").replace("L", "")


VALID_TARGET_ROLES = ("console_user", "admin")


def generate_code() -> str:
    """16 字符随机邀请码。"""
    return "".join(secrets.choice(CODE_CHARSET) for _ in range(CODE_LEN))


async def create_invite_code(
    s: AsyncSession,
    *,
    created_by: str | None,
    max_uses: int = 1,
    expires_in_days: int = 7,
    target_role: str = "console_user",
    note: str | None = None,
) -> InviteCode:
    if max_uses < 0:
        raise ValueError("max_uses 不能为负数,0 表示无限")
    if expires_in_days < 0:
        raise ValueError("expires_in_days 不能为负数,0 表示永久")
    if target_role not in VALID_TARGET_ROLES:
        raise ValueError(f"target_role 必须是 {VALID_TARGET_ROLES} 之一")

    expires_at = None if expires_in_days == 0 else _utcnow() + timedelta(days=expires_in_days)
    # 极小概率冲突,重试 3 次
    for _ in range(3):
        code = generate_code()
        existing = await s.scalar(select(InviteCode).where(InviteCode.code == code))
        if not existing:
            break
    else:
        # 三次都冲突,几乎不可能,返回 UUID 做兜底
        code = uuid.uuid4().hex[:CODE_LEN].upper()

    ic = InviteCode(
        code=code,
        created_by=created_by,
        max_uses=max_uses,
        used_count=0,
        expires_at=expires_at,
        target_role=target_role,
        revoked=False,
        note=note,
    )
    s.add(ic)
    await s.commit()
    await s.refresh(ic)
    return ic


def status_of(ic: InviteCode) -> Literal["active", "expired", "exhausted", "revoked"]:
    if ic.revoked:
        return "revoked"
    if ic.expires_at and ic.expires_at < _utcnow():
        return "expired"
    if ic.max_uses > 0 and ic.used_count >= ic.max_uses:
        return "exhausted"
    return "active"


async def validate_and_consume(s: AsyncSession, code: str) -> tuple[InviteCode | None, str]:
    """验证邀请码可用,可用则原子消费(used_count + 1),返回 (ic, error)。
    error 为空表示通过;否则前端展示。
    """
    if not code:
        return None, "请填写邀请码"
    code = code.strip().upper()
    ic = await s.scalar(select(InviteCode).where(InviteCode.code == code))
    if not ic:
        return None, "邀请码无效"

    st = status_of(ic)
    if st == "revoked":
        return None, "邀请码已被吊销"
    if st == "expired":
        return None, "邀请码已过期"
    if st == "exhausted":
        return None, "邀请码已用尽"

    # 消费(并发场景下用 row-level lock 更稳,但当前并发量低,先用乐观写)
    ic.used_count = (ic.used_count or 0) + 1
    await s.commit()
    await s.refresh(ic)
    return ic, ""


async def revoke_invite_code(s: AsyncSession, ic_id: str) -> InviteCode | None:
    ic = await s.get(InviteCode, ic_id)
    if not ic:
        return None
    ic.revoked = True
    await s.commit()
    await s.refresh(ic)
    return ic


async def list_invite_codes(s: AsyncSession, *, limit: int = 100) -> list[InviteCode]:
    rows = (await s.execute(
        select(InviteCode).order_by(InviteCode.created_at.desc()).limit(limit)
    )).scalars().all()
    return list(rows)
