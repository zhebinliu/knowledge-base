"""QA 使用数据：对话、单次问答日志、答案反馈。"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Conversation(Base):
    """多轮对话容器。持久化替换前端 localStorage。"""
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="新对话")

    # Persona：general = 通用 QA；pm = 虚拟项目经理（绑定 project_id）
    persona: Mapped[str] = mapped_column(String(20), default="general", nullable=False)
    project_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("projects.id"), nullable=True, index=True)

    # 过滤条件（保存对话级别的 LTC 阶段 / 行业，用户可以换）
    ltc_stage: Mapped[str | None] = mapped_column(String(50), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # [{role, content, sources?, model?, ts}]
    messages: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)


class QuestionLog(Base):
    """每次 QA 调用都落一条。答案为空/拒答 → unresolved=True 进未解决队列。"""
    __tablename__ = "question_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)

    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer_preview: Mapped[str | None] = mapped_column(Text, nullable=True)  # 前 500 字
    source_chunk_ids: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    persona: Mapped[str] = mapped_column(String(20), default="general", nullable=False)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # 拒答或空答时置 True；用户点踩后也会设为 True；resolved_at 为 resolve 时间
    unresolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)


class AnswerFeedback(Base):
    """用户对答案的 thumbs up/down/star。一个 question_log 一条反馈（最后一次覆盖）。"""
    __tablename__ = "answer_feedbacks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    question_log_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("question_logs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)

    # up / down / star
    rating: Mapped[str] = mapped_column(String(10), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
