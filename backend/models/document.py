import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    original_format: Mapped[str] = mapped_column(String(20), nullable=False)
    markdown_content: Mapped[str | None] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(String(1000))
    conversion_status: Mapped[str] = mapped_column(String(20), default="pending")
    conversion_quality_score: Mapped[float | None] = mapped_column(Float)
    # nullable：兼容老数据 + 未登录上传场景
    uploader_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, index=True
    )
    # 项目库：nullable FK，老文档保留无项目状态
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=True, index=True
    )
    # 文档类型：nullable，枚举见 models.project.DOC_TYPES
    doc_type: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)
