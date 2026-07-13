"""标准场景库 — Harness P3/P4 的知识底座。

2026-07-13 · 落地方案 v2:
- StandardScene:标准 Core 场景(LTC/ITR/MCR/MPR/MTL),场景命中(P3)对照的底库、
  蓝图回流(P4)审核通过后回写的目标。也可承载项目新增/优化后的场景(source_type='project')。
- SceneChange:场景修改记录 —— 何时、由哪个项目、以何种方式(新增/优化)变更了场景。
  「场景库中心」的变更历史读它。

首次启动 create_all 建表,并从 backend/data/scenes_seed.json 导入标准场景(空表才导)。
"""
from datetime import datetime

from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from models import Base


class StandardScene(Base):
    __tablename__ = "standard_scenes"
    __table_args__ = (
        UniqueConstraint("domain", "code", name="uq_scene_domain_code"),
        Index("ix_standard_scenes_domain", "domain"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    domain: Mapped[str] = mapped_column(String(20), nullable=False)          # LTC/ITR/MCR/MPR/MTL
    stage: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    stage_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)            # 如 LM-01
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)         # 阶段定义 / 场景说明

    # 来源:standard=标准库导入;project=由项目回流新增/优化
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="standard")
    source_project_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_project_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")  # active/archived
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<StandardScene {self.domain}/{self.code} {self.name!r}>"


class SceneChange(Base):
    __tablename__ = "scene_changes"
    __table_args__ = (
        Index("ix_scene_changes_scene", "scene_id"),
        Index("ix_scene_changes_project", "project_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    scene_id: Mapped[int | None] = mapped_column(
        ForeignKey("standard_scenes.id", ondelete="SET NULL"), nullable=True,
    )
    scene_code: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    domain: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # 变更类型:new=新增场景 / optimize=优化已有 / edit=后台直接编辑
    change_type: Mapped[str] = mapped_column(String(20), nullable=False, default="optimize")

    # 来源项目(标准库直接编辑时可空)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    project_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<SceneChange {self.change_type} {self.scene_code} project={self.project_name}>"
