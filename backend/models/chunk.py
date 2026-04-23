import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, Integer, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id", ondelete="CASCADE"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)

    # LTC 标签
    ltc_stage: Mapped[str | None] = mapped_column(String(50))
    ltc_stage_confidence: Mapped[float | None] = mapped_column(Float)

    # 分类标签
    industry: Mapped[str | None] = mapped_column(String(100))
    project_id: Mapped[str | None] = mapped_column(String(100))
    module: Mapped[str | None] = mapped_column(String(100))
    tags: Mapped[list] = mapped_column(JSON, default=list)

    # 来源
    source_section: Mapped[str | None] = mapped_column(String(500))
    char_count: Mapped[int | None] = mapped_column(Integer)

    # 审核状态
    review_status: Mapped[str] = mapped_column(String(20), default="auto_approved")
    reviewed_by: Mapped[str | None] = mapped_column(String(100))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)

    # 模型来源
    generated_by_model: Mapped[str | None] = mapped_column(String(100))

    # Qdrant point ID
    vector_id: Mapped[str | None] = mapped_column(String(100))

    # 关联到 ChallengeRun.id（challenge 固化的 Q+A 才有值）
    batch_id: Mapped[str | None] = mapped_column(String(36), index=True)

    # 检索热度：QA / 文档生成命中时异步自增
    citation_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_cited_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)
