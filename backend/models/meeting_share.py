"""会议分享表 — 把单个会议（含纪要）授权给指定用户。

设计要点（2026-05-27）:
- 主键用 int autoincrement;访问通过 (meeting_id, user_id) 唯一约束查询
- 与「项目协作者隐式访问」是两条并行通道:
    * 会议有 project → 项目协作者自动可见(由 _load_meeting_owned 走 project_acl 通道)
    * 会议没 project（或要分享给项目外的其他人） → 走 MeetingShare 显式记录
- 删除 Meeting 时 ON DELETE CASCADE 一起清掉
- 不允许把会议 owner 自己加进 share 表（API 层校验,DB 不强约束）
"""
from datetime import datetime
from sqlalchemy import Integer, String, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from models import Base
from services._time import utcnow_naive as _utcnow


class MeetingShare(Base):
    __tablename__ = "meeting_shares"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    meeting_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("meeting_id", "user_id", name="uq_meeting_share"),
        Index("idx_meeting_share_user", "user_id"),
    )

    def __repr__(self) -> str:
        return f"<MeetingShare meeting_id={self.meeting_id} user_id={self.user_id!r}>"
