"""项目级干系人资产(2026-05-12)。

会议级 stakeholder_map 是单次会议的人物视图;项目级则跨多会议合并:
- 同一项目下多次会议出现的同一人(name + aliases 重叠) → 合并成一条
- 改项目级人物名 → 同步到该项目所有 meeting 的 minutes / requirements
- source_meeting_ids 记录 stakeholders 来自哪些 meeting,便于追溯
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, JSON, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from models import Base

from services._time import utcnow_naive as _utcnow


class ProjectStakeholder(Base):
    __tablename__ = "project_stakeholders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # 别名(昵称、不同称呼)
    aliases: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)

    role: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    organization: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    # internal / customer / vendor / unknown
    side: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    contact: Mapped[str] = mapped_column(String(128), nullable=False, default="")

    key_points: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    responsibilities: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)

    # 这个人物在哪些 meeting 出现过(整数 ID 列表)
    source_meeting_ids: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        # 同一项目内,name 唯一(合并时 dedup 用)
        UniqueConstraint("project_id", "name", name="uq_project_stake_name"),
        Index("idx_project_stake_proj", "project_id"),
    )
