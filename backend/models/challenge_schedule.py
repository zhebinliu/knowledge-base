import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


def _utcnow():
    return datetime.now(timezone.utc)


class ChallengeSchedule(Base):
    __tablename__ = "challenge_schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), default="默认计划")
    stages: Mapped[list] = mapped_column(JSON, default=lambda: ["线索", "商机"])
    questions_per_stage: Mapped[int] = mapped_column(Integer, default=2)
    cron_expression: Mapped[str] = mapped_column(String(100), default="0 9 * * 1-5")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)
