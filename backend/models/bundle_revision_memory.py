"""修订版学习记忆 — 用户上传修订版覆盖 AI 产出后,LLM 抽取的「偏好笔记」。

数据流:
1. 用户 POST /api/outputs/{id}/markdown-override 上传修订版,覆盖 bundle.content_md
2. Celery 异步任务 `analyze_bundle_revision` 拉原版 + 修订版,LLM 抽 3-5 条「用户总是...」
3. INSERT 一条记录到这里(全局共享,按 bundle_kind 分桶)
4. 下次同 kind 生成 → SELECT enabled=true + DESC + LIMIT → 拼到 system prompt 顶部

scope 决策(2026-06-08):
- **全局**(不按 user / project / industry 隔离)— 公司方法论沉淀场景下跨项目复用价值最大
- **按 bundle_kind 隔离** — 蓝图改的偏好不应该污染对象字段表的生成 prompt
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean, Integer, Index
from sqlalchemy.orm import Mapped, mapped_column
from models import Base
from services._time import utcnow_naive as _utcnow


class BundleRevisionMemory(Base):
    __tablename__ = "bundle_revision_memories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # 全局分桶 key — 决定这条 memory 给哪类 bundle 生成时用
    # blueprint_design / object_field_layout / process_setup / research_report
    bundle_kind: Mapped[str] = mapped_column(String(40), nullable=False)

    # 这条 memory 是从哪条修订学来的(便于后台溯源 + 列表里点回去看原文)
    # SET NULL:即使 bundle 被删了,memory 还在(它已经是抽象知识了)
    source_bundle_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("curated_bundles.id", ondelete="SET NULL"), nullable=True
    )
    source_project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    source_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # LLM 抽出的修订笔记(Markdown bullet list,3-5 条)
    notes_md: Mapped[str] = mapped_column(Text, nullable=False)

    # 是否启用:管理员后台可一键停用单条(不删除,保留审计痕迹)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 元数据:修订前后字符数(便于后台看变更幅度)
    original_chars: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_chars: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # 分析时用的模型(便于排查质量问题 + 后期分模型评估)
    llm_model: Mapped[str | None] = mapped_column(String(60), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    # 复合索引:生成时 WHERE bundle_kind=? AND enabled=true ORDER BY created_at DESC LIMIT N
    __table_args__ = (
        Index("idx_bundle_revision_memories_kind_enabled_created",
              "bundle_kind", "enabled", "created_at"),
    )
