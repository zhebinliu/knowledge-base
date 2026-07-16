"""会议组织调查问卷模型(2026-07-16)。

三种问卷类型:
- time_poll: 时间调查,收集参会者可接受的时间段
- attendance: 出席确认,确定时间后统计能出席的人数
- satisfaction: 满意度问卷,会后收集满意度评分

流程: time_poll → finalize(确定时间) → attendance → 会后 → satisfaction
每个问卷有 share_token,支持免登录填答。
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, Boolean, DateTime, ForeignKey, JSON, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from models import Base
from services._time import utcnow_naive as _utcnow


class MeetingSurvey(Base):
    __tablename__ = "meeting_surveys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # time_poll / attendance / satisfaction
    survey_type: Mapped[str] = mapped_column(String(20), nullable=False, default="time_poll")

    # time_poll: 候选时间段 [{start, end, label}]
    time_options: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # attendance/satisfaction: 最终确定的会议时间
    meeting_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    meeting_location: Mapped[str | None] = mapped_column(String(256), nullable=True)

    # satisfaction: 问卷题目 [{id, question, type: "score"|"text"}]
    satisfaction_questions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    # open / closed / finalized
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", index=True)

    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # 公开访问 token(免登录填答)
    share_token: Mapped[str] = mapped_column(
        String(36), nullable=False, default=lambda: str(uuid.uuid4()), unique=True, index=True
    )

    # 是否公开结果(参会者可看统计)
    results_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<MeetingSurvey id={self.id} type={self.survey_type!r} status={self.status!r}>"


class MeetingSurveyResponse(Base):
    __tablename__ = "meeting_survey_responses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    survey_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("meeting_surveys.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # 免登录填答: respondent_name 必填; 登录用户额外存 user_id
    respondent_name: Mapped[str] = mapped_column(String(100), nullable=False)
    respondent_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # time_poll: 选中的时间槽 index 列表 [0, 2, 3]
    selected_time_slots: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # attendance: True/False
    can_attend: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # satisfaction: [{question_id, score, text}]
    satisfaction_answers: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    suggestion: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    __table_args__ = (
        # 同一问卷同一人名不重复(防刷)
        UniqueConstraint("survey_id", "respondent_name", name="uq_survey_response_name"),
        Index("idx_survey_response_survey", "survey_id"),
    )

    def __repr__(self) -> str:
        return f"<MeetingSurveyResponse id={self.id} survey={self.survey_id} name={self.respondent_name!r}>"
