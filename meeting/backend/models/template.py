"""会议纪要模板 ORM 模型。

存储用户通过编辑迭代 + KB 分析生成的会议纪要模板，
活跃模板会被注入到 AI 生成纪要的 system prompt 中。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models import Base
from services._time import utcnow_naive as _utcnow


class MeetingTemplate(Base):
    """版本化的会议纪要模板。"""

    __tablename__ = "meeting_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False, default="默认模板")
    description: Mapped[str | None] = mapped_column(Text, nullable=True, default="")

    # JSON 文本:期望的输出字段定义
    schema_structure: Mapped[str | None] = mapped_column(Text, nullable=True, default="")
    # 自然语言格式要求(注入 AI system prompt)
    format_requirements: Mapped[str | None] = mapped_column(Text, nullable=True, default="")
    # 风格偏好(语气、详细程度、关注领域)
    style_preferences: Mapped[str | None] = mapped_column(Text, nullable=True, default="")

    # 版本号
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # 是否活跃
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 贡献此模板的本地会议 ID (JSON 数组文本)
    source_meeting_ids: Mapped[str | None] = mapped_column(Text, nullable=True, default="[]")
    # 贡献此模板的 KB 文档引用 (JSON 数组文本)
    source_kb_doc_refs: Mapped[str | None] = mapped_column(Text, nullable=True, default="[]")
    # 演化方式: initial / user_edit / kb_analysis / combined
    evolution_method: Mapped[str] = mapped_column(String(64), nullable=False, default="initial")
    # 变更日志
    change_log: Mapped[str | None] = mapped_column(Text, nullable=True, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    def __repr__(self) -> str:
        return (
            f"<MeetingTemplate id={self.id} name={self.name!r} "
            f"version={self.version} active={self.is_active}>"
        )
