"""现场调研实时副驾建议(2026-06-22)。

录音过程中,分析层基于截至目前的转写 + 项目/行业/LTC 基准,产出 4 类调研建议,
按条入库(支持跨轮去重 + 澄清闭环):open → resolved / dismissed。
"""
from datetime import datetime
from sqlalchemy import String, Text, Integer, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from models import Base
from services._time import utcnow_naive as _utcnow


class MeetingLiveAdvice(Base):
    __tablename__ = "meeting_live_advice"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    meeting_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # clarification(需明确) / ambiguity(歧义) / gap(未涉及但影响方案) / industry(行业专属)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)            # 一句话建议/要点
    question: Mapped[str | None] = mapped_column(Text, nullable=True)   # 引导客户确认的问法
    recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)  # 我方建议方案(让客户在此基础上确认/微调)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)  # 为什么重要 / 影响哪部分方案
    source_quote: Mapped[str | None] = mapped_column(Text, nullable=True)   # 转写出处片段
    source_ts: Mapped[float | None] = mapped_column(Float, nullable=True)   # 出处秒数(前端 [MM:SS] 跳转)
    ltc_module: Mapped[str | None] = mapped_column(String(40), nullable=True)  # 关联 LTC 模块 key(gap 用)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")  # high/medium/low

    # open(待处理) / resolved(已被后续对话澄清) / dismissed(顾问手动忽略)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="open", index=True)
    # 人工 完成/删除 时置 True,区别于 LLM 自动 resolved —— 作为精确率 eval 的干净信号
    resolved_by_user: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    run_seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # 第几轮分析产出

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<MeetingLiveAdvice id={self.id} cat={self.category!r} status={self.status!r}>"
