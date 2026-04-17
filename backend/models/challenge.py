import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    batch_id: Mapped[str | None] = mapped_column(String(100))

    question: Mapped[str] = mapped_column(Text, nullable=False)
    question_model: Mapped[str | None] = mapped_column(String(100))
    target_ltc_stage: Mapped[str | None] = mapped_column(String(50))
    target_chunks: Mapped[list] = mapped_column(JSON, default=list)

    answer: Mapped[str | None] = mapped_column(Text)
    answer_model: Mapped[str | None] = mapped_column(String(100))
    answer_source_chunks: Mapped[list] = mapped_column(JSON, default=list)

    judge_score: Mapped[float | None] = mapped_column(Float)
    judge_model: Mapped[str | None] = mapped_column(String(100))
    judge_reasoning: Mapped[str | None] = mapped_column(Text)
    judge_decision: Mapped[str | None] = mapped_column(String(20))

    generated_chunk_id: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
