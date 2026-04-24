import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ChallengeRun(Base):
    __tablename__ = "challenge_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trigger_type: Mapped[str] = mapped_column(String(20), default="manual")  # manual / scheduled
    triggered_by: Mapped[str | None] = mapped_column(String(64))  # user_id or schedule_id
    triggered_by_name: Mapped[str | None] = mapped_column(String(200))  # 冗余存触发者展示名

    target_stages: Mapped[list] = mapped_column(JSON, default=list)
    questions_per_stage: Mapped[int] = mapped_column(Integer, default=2)
    # kb_based = 基于知识库切片出题；free_form = LLM 自由出题，不依赖切片
    question_mode: Mapped[str] = mapped_column(String(20), default="kb_based")

    started_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)

    total: Mapped[int] = mapped_column(Integer, default=0)
    passed: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="running")  # running / completed / failed
    error_message: Mapped[str | None] = mapped_column(String(500))
