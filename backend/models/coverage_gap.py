"""知识覆盖缺口：Challenge 失败题按 (ltc_stage, industry) 聚合，告诉 PM 该补哪里。

dedup key = (ltc_stage, industry or ''). 同 key 再次失败 → fail_count+1、keywords 合并、last_seen_at 刷新。
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class CoverageGap(Base):
    __tablename__ = "coverage_gaps"
    __table_args__ = (
        UniqueConstraint("ltc_stage", "industry", name="uq_coverage_gap_stage_industry"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ltc_stage: Mapped[str | None] = mapped_column(String(50), index=True)
    industry: Mapped[str | None] = mapped_column(String(50), index=True)

    # 最近 N 个失败题的代表性问题 / 关键词：用于提示 PM 该补什么内容
    keywords: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    sample_questions: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    fail_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)
