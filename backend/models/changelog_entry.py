"""平台更新日志条目 — 对外 API 开放读取,内部 admin 维护(2026-07-03)。

数据流:admin JWT 写入 → is_published=true 后 → 对外 X-API-Key(复用 users.mcp_api_key)读取。
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, JSON, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column

from models import Base
from services._time import utcnow_naive as _utcnow


class ChangelogEntry(Base):
    __tablename__ = "changelog_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 语义化版本号,如 "v1.2.0";可空(比如「本周更新」类不绑版本)
    version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # markdown 正文
    content_md: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # feature | fix | improvement | breaking | security
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="feature")
    # 自由标签,如 ["会议纪要","方案设计"],给对外调用方分组用
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 创建人(admin user id / username),记录不做外键防止误删用户后条目消失
    author_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    author_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        Index("ix_changelog_published_at", "is_published", "published_at"),
    )
