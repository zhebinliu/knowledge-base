"""会议纪要版面模板 ORM 模型。

存储用于渲染/导出会议纪要的版面模板（统一存储为 Markdown 格式），
支持预置模板和用户上传模板（图片/Word/Markdown）。
与 MeetingTemplate（AI prompt 注入模板）是不同的概念。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models import Base
from services._time import utcnow_naive as _utcnow


class MarkupTemplate(Base):
    """会议纪要版面模板。存储为 Markdown，含 {{placeholder}} 占位符。"""

    __tablename__ = "meeting_markup_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False, default="默认模板")
    description: Mapped[str | None] = mapped_column(Text, nullable=True, default="")

    # 模板内容（Markdown 格式，含 {{title}} {{date}} {{summary}} 等占位符）
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # 分类：preset（预置）/ user_upload（用户上传）
    category: Mapped[str] = mapped_column(String(32), nullable=False, default="user_upload")

    # 来源格式：markdown / docx / image
    source_format: Mapped[str] = mapped_column(String(32), nullable=False, default="markdown")

    # 是否内置（内置模板不可删除）
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    def __repr__(self) -> str:
        return (
            f"<MarkupTemplate id={self.id} name={self.name!r} "
            f"category={self.category}>"
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description or "",
            "content": self.content,
            "category": self.category,
            "source_format": self.source_format,
            "is_builtin": self.is_builtin,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
