"""项目库：Project 模型。文档通过 nullable FK 关联，不破坏老数据。"""
import uuid
from datetime import datetime, timezone, date
from sqlalchemy import String, Text, Date, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# 文档类型枚举（在代码层面收敛；DB 用 VARCHAR 不强约束以便后续扩展）
DOC_TYPES = (
    "requirement_research",  # 需求调研
    "meeting_notes",         # 会议纪要
    "solution_design",       # 方案设计
    "test_case",             # 测试用例
    "user_manual",           # 用户手册
)

DOC_TYPE_LABELS = {
    "requirement_research": "需求调研",
    "meeting_notes": "会议纪要",
    "solution_design": "方案设计",
    "test_case": "测试用例",
    "user_manual": "用户手册",
}


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    customer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # JSON 存涉及模块列表，元素来自 ltc_taxonomy.MODULE_TAGS
    modules: Mapped[list | None] = mapped_column(JSON, nullable=True)
    kickoff_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)
