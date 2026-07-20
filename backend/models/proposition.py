"""项目命题 — 场景命中神经网络的中间层。

每份文档独立抽取命题(需求/决策/约束/假设),命题对齐到标准场景后,
场景的"命中"从 LLM 黑盒判定变成有证据链的可追踪网络。

命题状态由拓扑决定(不靠 LLM 推理):
- 有多份文档提及 = 有证据链(alive)
- 仅一份文档提及 = 证据薄弱(weak)
- 早期提出后续静默消失 = 断链(dead)
"""
from datetime import datetime

from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column

from models import Base


class ProjectProposition(Base):
    """单条命题:从一份文档中抽取的一个可讨论的需求/决策/约束/假设。"""
    __tablename__ = "project_propositions"
    __table_args__ = (
        Index("ix_propositions_project", "project_id"),
        Index("ix_propositions_document", "document_id"),
        Index("ix_propositions_topic_group", "project_id", "topic_group"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
    )
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False,
    )

    topic: Mapped[str] = mapped_column(String(300), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False, default="requirement")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    topic_group: Mapped[str | None] = mapped_column(String(300), nullable=True)
    scene_codes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<Proposition {self.topic!r} cat={self.category} doc={self.document_id[:8]}>"


class PropositionNetwork(Base):
    """项目级命题网络快照 — 一个项目留一份最新。"""
    __tablename__ = "proposition_networks"
    __table_args__ = (Index("uq_propnet_project", "project_id", unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
    )

    stats: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    network_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    doc_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    proposition_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    scene_hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
