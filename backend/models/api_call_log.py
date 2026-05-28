import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, Index, Text
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


from services._time import utcnow_naive as _utcnow


class ApiCallLog(Base):
    """统一调用日志:覆盖 REST / MCP / LLM 三类。

    2026-05-28 扩字段:
    - call_kind 用 'llm' 区分大模型调用
    - model_name / caller_module / input_tokens / output_tokens / duration_ms / error_message
      对 'llm' 类记录有意义,其他类型 nullable
    """
    __tablename__ = "api_call_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 'mcp_key' | 'jwt' | 'system'(LLM 内部调用,不归属任何用户)
    token_type: Mapped[str] = mapped_column(String(10), nullable=False)
    # 旧:'mcp' | 'rest';新增 'llm'
    call_type: Mapped[str] = mapped_column(String(10), nullable=False)
    # MCP: "tools/call:ask_kb"; REST: "/api/qa/ask"; LLM: 模型名 model_name
    endpoint: Mapped[str] = mapped_column(String(200), nullable=False)
    # HTTP status or None
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    # ── LLM 专有字段(其他类型 nullable) ──
    # 实际调用的模型名(对外名,不是 model_id)
    model_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 调用方模块(如 "api.meeting" / "agents.slicer_agent")
    caller_module: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 任务名(routing rule key,直接 chat() 时为 None)
    task: Mapped[str | None] = mapped_column(String(64), nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("idx_call_logs_user", "user_id"),
        Index("idx_call_logs_created", "created_at"),
        Index("idx_call_logs_call_type", "call_type"),
        Index("idx_call_logs_model", "model_name"),
    )
