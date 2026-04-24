import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ProjectInterviewAnswer(Base):
    """项目访谈答案：kickoff_pptx / insight 这类输出先做一问一答，再根据答案生成文档。"""
    __tablename__ = "project_interview_answers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    output_kind: Mapped[str] = mapped_column(String(40), nullable=False)  # kickoff_pptx / insight
    question_key: Mapped[str] = mapped_column(String(100), nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("project_id", "output_kind", "question_key", name="uq_interview_answer"),
        Index("idx_interview_project_kind", "project_id", "output_kind"),
    )
