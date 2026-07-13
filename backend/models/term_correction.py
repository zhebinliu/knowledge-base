"""用户级名词校正词典(2026-07-13)。

每个用户维护自己的名词清单,ASR 润色时注入 prompt,将不确定名词替换为准确名称。
- wrong_term: ASR 可能识别错的词(如"纷享消客")
- correct_term: 正确名称(如"纷享销客")
- (user_id, wrong_term) 唯一,避免重复
"""
from datetime import datetime
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from models import Base
from services._time import utcnow_naive as _utcnow


class TermCorrection(Base):
    __tablename__ = "term_corrections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    wrong_term: Mapped[str] = mapped_column(String(200), nullable=False)    # 错误/不确定词
    correct_term: Mapped[str] = mapped_column(String(200), nullable=False)  # 正确名称
    note: Mapped[str | None] = mapped_column(Text, nullable=True)            # 备注(可选)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "wrong_term", name="uq_term_correction_user_wrong"),
        Index("idx_term_correction_user", "user_id"),
    )

    def __repr__(self) -> str:
        return f"<TermCorrection id={self.id} wrong={self.wrong_term!r} correct={self.correct_term!r}>"
