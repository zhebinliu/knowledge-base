"""调研问卷答案持久化 — 顾问在工作区里勾选/录入,按 (bundle_id, item_key) 写入。

跟 CuratedBundle.extra.questionnaire_items[] 互补:
- questionnaire_items[] 是 LLM 生成的题目结构(题干 + 选项池),read-only
- research_responses 是顾问答案(可改),包含 LLM 给的范围四分类建议 + 顾问手改
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, JSON, DateTime, Index, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


from services._time import utcnow_naive as _utcnow


class ResearchResponse(Base):
    __tablename__ = "research_responses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    bundle_id: Mapped[str] = mapped_column(String(36), ForeignKey("curated_bundles.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    # 唯一定位题目:跟 QuestionItem.item_key 一致(例:"M02_opportunity::stage_model")
    item_key: Mapped[str] = mapped_column(String(120), nullable=False)
    # 答案值 — 单选/数值/文本是 scalar,多选/节点勾选是 list,统一存 JSON
    answer_value: Mapped[dict | list | str | int | float | None] = mapped_column(JSON, nullable=True)
    # 范围四分类标签:new / digitize / migrate / out_of_scope
    scope_label: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # ai / manual — 区分 LLM 自动判断 vs 顾问手改
    scope_label_source: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # 谁录入的(顾问 user_id)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        # 同一 bundle 同一 item 只有一份答案 — 顾问改答案时 upsert
        Index("uq_research_responses_bundle_item", "bundle_id", "item_key", unique=True),
        Index("idx_research_responses_project", "project_id"),
    )
