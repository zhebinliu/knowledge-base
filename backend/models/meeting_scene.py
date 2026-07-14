"""会议场景增量 — 每场会议识别出的「涉及场景」(2026-07-14 闭环③ 的持久化层)。

每场会议经 LLM 逐场判定后,产出对项目业务范围的场景增量:
- in_scope:本场明确纳入/确认的标准场景
- out_of_scope:本场明确取消/移出的标准场景

存这张表让「会议详情」直接展示本场涉及场景,也让项目场景命中折叠时复用(免重算)。
按 meeting_id 唯一;会议纪要变了(minutes_hash 变)可重新识别覆盖。
"""
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from models import Base


class MeetingSceneDelta(Base):
    __tablename__ = "meeting_scene_deltas"
    __table_args__ = (UniqueConstraint("meeting_id", name="uq_meeting_scene_delta_meeting"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    meeting_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False,
    )
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # [{domain, code, name}, ...]
    in_scope: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    out_of_scope: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    minutes_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # 纪要指纹,判是否需重识别
    detected_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<MeetingSceneDelta meeting={self.meeting_id} in={len(self.in_scope or [])} out={len(self.out_of_scope or [])}>"
