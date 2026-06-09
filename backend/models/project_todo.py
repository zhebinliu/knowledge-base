"""项目待办看板 — 独立于会议纪要的待办追踪模型。

待办来源:
1. 从会议 action_items 自动导入（meeting_id 非空）
2. 手动创建（meeting_id 为空）
"""
from datetime import date, datetime

from sqlalchemy import String, Text, Date, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from models import Base


class ProjectTodo(Base):
    __tablename__ = "project_todos"
    __table_args__ = (
        Index("ix_project_todos_project", "project_id"),
        Index("ix_project_todos_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # 所属项目
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)

    # 来源会议（可空，手动创建时为空）
    meeting_id: Mapped[int | None] = mapped_column(
        ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True,
    )

    # 待办内容
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # 负责人
    assignee: Mapped[str] = mapped_column(String(100), nullable=False, default="")

    # 截止日期
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # 优先级: P0=紧急, P1=重要, P2=一般
    priority: Mapped[str] = mapped_column(String(4), nullable=False, default="P1")

    # 状态: pending=待处理, doing=进行中, done=已完成
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")

    # 原文摘录（从会议导入时填充）
    source_quote: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 备注
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 依赖关系：被哪个待办阻塞（FK 自引用）
    blocked_by: Mapped[int | None] = mapped_column(
        ForeignKey("project_todos.id", ondelete="SET NULL"), nullable=True,
    )

    # 时间戳
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<ProjectTodo id={self.id} content={self.content[:20]!r} status={self.status}>"
