"""SOW 模块名 → LTC 字典 同义词映射沉淀表。

每次跑 sow_mapper 时,客户 SOW 里的"销售机会管理"、"商机阶段"等说法
都映射到 LTC 字典的标准 key(例 M02_opportunity)。
落库后,下个项目再遇到同样的客户术语时,可以先查这张表做快速命中。

也用于:
- 顾问在前端确认 / 修改映射
- 字典"沉淀升级":高频且稳定的客户术语可以人工合并进 ltc_dictionary.aliases
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, Boolean, DateTime, Index, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ResearchLtcModuleMap(Base):
    __tablename__ = "research_ltc_module_maps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    # 客户在 SOW 里用的原始术语(原文片段,可重复)
    sow_term: Mapped[str] = mapped_column(String(200), nullable=False)
    # 映射到 LTC 字典的标准 key(例 M02_opportunity);is_extra=True 时为空
    mapped_ltc_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # LLM 给出的置信度 0-1
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # 是否超出 LTC 字典(extra_modules,例如客户特有的"测试服务"、"硬件交付"等)
    is_extra: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    __table_args__ = (
        Index("idx_research_ltc_map_project", "project_id"),
        Index("idx_research_ltc_map_key", "mapped_ltc_key"),
    )
