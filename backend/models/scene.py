"""标准场景库 — Harness P3/P4 的知识底座。

2026-07-13 · 落地方案 v2:
- StandardScene:标准 Core 场景(LTC/ITR/MCR/MPR/MTL),场景命中(P3)对照的底库、
  蓝图回流(P4)审核通过后回写的目标。也可承载项目新增/优化后的场景(source_type='project')。
- SceneChange:场景修改记录 —— 何时、由哪个项目、以何种方式(新增/优化)变更了场景。
  「场景库中心」的变更历史读它。

首次启动 create_all 建表,并从 backend/data/scenes_seed.json 导入标准场景(空表才导)。
"""
from datetime import datetime

from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, UniqueConstraint, Index, JSON
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
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)         # 阶段定义(骨架自带)

    # ── 结构化内容(2026-07-13,先留空骨架,可在场景库中心编辑)──
    description: Mapped[str | None] = mapped_column(Text, nullable=True)        # 场景说明
    business_rules: Mapped[str | None] = mapped_column(Text, nullable=True)    # 业务规则
    process: Mapped[str | None] = mapped_column(Text, nullable=True)           # 流程
    recommended_fields: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # 推荐字段表格 [{name,type,note,required}]
    # 标签:多选,值为 "通用" 或四级行业路径 "L1/L2/L3/L4"(可只到某一级)
    tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # AI 能力匹配(场景的 AI 优化选择):关联的 ai_capabilities.id 列表(2026-07-13)
    ai_capabilities: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

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


class SceneHitReport(Base):
    """场景命中报告 — Harness P3。一个项目留一份最新(project_id 唯一)。"""
    __tablename__ = "scene_hit_reports"
    __table_args__ = (UniqueConstraint("project_id", name="uq_scene_hit_project"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
    )
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    miss_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hits: Mapped[list] = mapped_column(JSON, nullable=False, default=list)     # [{domain,code,name}]
    misses: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    sources: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # 命中依据的文档 [{kind,type,name}]
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_md: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class SceneChangeProposal(Base):
    """蓝图回流提案 — Harness P4。蓝图完成识别出的场景优化/新增,经 PM 确认 → 管理员审核 → 回写场景库。"""
    __tablename__ = "scene_change_proposals"
    __table_args__ = (
        Index("ix_scene_proposals_project", "project_id"),
        Index("ix_scene_proposals_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
    )
    project_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    change_type: Mapped[str] = mapped_column(String(20), nullable=False)   # new | optimize
    domain: Mapped[str | None] = mapped_column(String(20), nullable=True)
    scene_code: Mapped[str | None] = mapped_column(String(40), nullable=True)   # optimize 指向已有编码
    name: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 结构化内容载荷(说明/业务规则/流程/推荐字段),审核通过后沉淀成场景字段(2026-07-13 Block6)
    content: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # pm_pending=待 PM 确认 / admin_pending=待管理员审核 / approved=已通过回写 / rejected=已驳回
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pm_pending")

    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pm_confirmed_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pm_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<SceneChangeProposal {self.change_type} {self.scene_code or self.name!r} {self.status}>"


class AiCapability(Base):
    """纷享已预研 AI 能力目录 — 场景「AI 能力匹配 / AI 优化选择」的可选项底库。

    2026-07-13:从《当前AI能力.xlsx》导入(领域→Agent→Skill),空表首启导入
    backend/seeds/ai_capabilities_seed.json。
    """
    __tablename__ = "ai_capabilities"
    __table_args__ = (Index("ix_ai_capabilities_domain", "domain"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    domain: Mapped[str] = mapped_column(String(40), nullable=False, default="")   # 效率工具/开源/客户…
    agent: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    skill: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="")   # 已具备/开发中/未开发
    plan_date: Mapped[str | None] = mapped_column(String(20), nullable=True)      # 计划上线时间
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    outputs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)     # 主要输出
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<AiCapability {self.agent}/{self.skill} {self.status}>"
