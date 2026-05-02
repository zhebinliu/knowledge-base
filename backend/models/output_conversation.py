"""输出对话：用户与输出智能体的访谈式会话，替代静态题库。"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


from services._time import utcnow_naive as _utcnow


class OutputConversation(Base):
    __tablename__ = "output_conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # kickoff_pptx | survey | insight
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    # 二选一：项目作用域 或 行业作用域
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    industry: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # 创建时锁定的智能体配置快照
    skill_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    model_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # 对话消息序列：OpenAI 格式 [{role, content, tool_calls?, tool_call_id?}]
    messages: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # 已检索到的知识库证据：[{chunk_id, content, document_id, source_section, ltc_stage, query}]
    refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # active | generating | done | failed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    bundle_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        Index("idx_output_conv_kind_project", "kind", "project_id"),
    )
