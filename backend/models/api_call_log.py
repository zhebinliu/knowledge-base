import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, Integer, Index
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


from services._time import utcnow_naive as _utcnow


class ApiCallLog(Base):
    __tablename__ = "api_call_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 'mcp_key' | 'jwt'
    token_type: Mapped[str] = mapped_column(String(10), nullable=False)
    # 'mcp' | 'rest'
    call_type: Mapped[str] = mapped_column(String(10), nullable=False)
    # MCP: "tools/call:ask_kb"; REST: "/api/qa/ask"
    endpoint: Mapped[str] = mapped_column(String(200), nullable=False)
    # HTTP status or None
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    __table_args__ = (
        Index("idx_call_logs_user", "user_id"),
        Index("idx_call_logs_created", "created_at"),
    )
