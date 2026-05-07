"""邀请码表 — 注册时必须凭一个有效邀请码才能创建账号。

字段:
- code:16 字符随机串(URL-safe)。前端展示给管理员复制
- max_uses:0 表示无限,默认 1(一次性邀请)
- used_count:已被几个新用户用掉
- expires_at:过期时间,null 表示永久(慎用)
- target_role:这个码注册出来的账号默认角色 — console_user / admin
- revoked:管理员手动吊销
- note:管理员自己看的备注(给谁的、什么场景)

状态判断(派生):
  active     = !revoked && !expired && (max_uses==0 or used_count < max_uses)
  expired    = expires_at && now > expires_at
  exhausted  = max_uses>0 && used_count >= max_uses
  revoked    = 字段
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from models import Base
from services._time import utcnow_naive as _utcnow


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    max_uses: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    used_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    target_role: Mapped[str] = mapped_column(String(32), default="console_user", nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        Index("ix_invite_codes_revoked", "revoked"),
    )
