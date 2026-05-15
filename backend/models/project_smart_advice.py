"""项目级 AI 智能建议 — 综合所有项目信息 + 行业 know-how + 当前阶段, 生成下一步建议 + 风险列表。

特点:
- 一个项目只有一行(project_id 唯一约束)
- inputs_hash:基于 brief + outputs + docs + industry 算出来的指纹, 用于判断是否需要重新生成
- is_stale:外部事件可以标记此 advice 已过期(下次 GET 触发重新生成)
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Text, JSON, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from models import Base
from services._time import utcnow_naive as _utcnow


class SmartAdvice(Base):
    """项目智能建议(常驻在项目详情页的 AI 助手)。"""
    __tablename__ = "project_smart_advice"
    __table_args__ = (UniqueConstraint("project_id", name="uq_smart_advice_project"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)

    # 主要内容(LLM 输出)
    advice_md: Mapped[str] = mapped_column(Text, nullable=False, default="")     # 主建议 markdown
    next_steps: Mapped[list] = mapped_column(JSON, nullable=False, default=list) # ["下一步动作 1", "下一步动作 2", ...]
    risks: Mapped[list] = mapped_column(JSON, nullable=False, default=list)      # ["风险 1", "风险 2", ...]

    # cache 控制
    inputs_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    is_stale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    model_used: Mapped[str | None] = mapped_column(String(60), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)               # 上次生成失败的错误(不抛出, 留给前端展示)

    generated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)
