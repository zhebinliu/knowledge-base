import uuid
from datetime import datetime, timezone
from sqlalchemy import String, JSON, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


from services._time import utcnow_naive as _utcnow


class ProjectBrief(Base):
    """项目 Brief：按 (project_id, output_kind) 唯一。
    fields 结构：{ field_key: { value, confidence, sources, auto_filled_at?, edited_at? } }
    """
    __tablename__ = "project_briefs"
    __table_args__ = (UniqueConstraint("project_id", "output_kind", name="uq_brief_project_kind"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    output_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    fields: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)
    updated_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
