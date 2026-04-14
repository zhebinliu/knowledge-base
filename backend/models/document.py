import uuid
from datetime import datetime
from sqlalchemy import String, Text, Float, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    original_format: Mapped[str] = mapped_column(String(20), nullable=False)
    markdown_content: Mapped[str | None] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(String(1000))
    conversion_status: Mapped[str] = mapped_column(String(20), default="pending")
    conversion_quality_score: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
