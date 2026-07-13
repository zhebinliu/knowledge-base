"""项目闸门状态 — Harness 人工确认闸门(HITL)的持久层。

2026-07-13 · 落地方案 v2 P1:
系统原本只有产物级状态(bundle.status),没有「某阶段人工是否已确认放行」。
本表补上这层:一个项目 × 一个闸门 = 一行状态。

P1 只用两道硬闸(阶段转移闸):
- gate_key='asis':需求调研(survey)完成 → 才能生成方案设计(design)。
- gate_key='tobe':方案设计(design)完成 → 才能生成项目实施(implement)。

表结构对后续软闸(就绪/对客提交)通用,新增闸门只需加 gate_key,不改表。
"""
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from models import Base


class ProjectStageGate(Base):
    __tablename__ = "project_stage_gates"
    __table_args__ = (
        UniqueConstraint("project_id", "gate_key", name="uq_project_stage_gate"),
        Index("ix_project_stage_gates_project", "project_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # 所属项目
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
    )

    # 闸门标识:'asis' | 'tobe'(P1);后续软闸复用同一表
    gate_key: Mapped[str] = mapped_column(String(40), nullable=False)

    # 状态:'open'=未确认(默认) | 'confirmed'=已确认放行
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")

    # 确认人(用户名,便于「何人确认」直读)
    confirmed_by: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # 确认时间
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # 备注(可选,确认时附言)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<ProjectStageGate project={self.project_id} gate={self.gate_key} status={self.status}>"
