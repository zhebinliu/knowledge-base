"""挑战回合(ChallengeRound):每个 bundle 生成后,挑战者按固定 rubric 找问题,
循环最多 N 轮,每一轮的评语 + 触发的模块重生成 都记录在这里。

前端工作台展示用:报告视图顶部的「挑战回合」面板。
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, JSON, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ChallengeRound(Base):
    """一个 bundle 的一轮挑战记录。

    critique_json 结构:
      {
        "verdict":     "pass" | "minor_issues" | "major_issues",
        "summary":     "本轮发现 3 个问题,涉及 M3/M7 模块,主要是 ...",
        "issues": [
          {
            "module_key": "M3_health_radar",
            "dimension":  "specificity" | "evidence" | "timeliness" | "next_step" |
                          "completeness" | "consistency" | "jargon",
            "severity":   "blocker" | "major" | "minor",
            "text":       "M3 质量维度的 RAG=red 但没引用具体缺陷数据",
            "suggestion": "补充 [D1] 里的 UAT 缺陷计数,如 12/15 报告 8 项 P1"
          }
        ]
      }
    """
    __tablename__ = "challenge_rounds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    bundle_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("curated_bundles.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    round_idx: Mapped[int] = mapped_column(Integer, nullable=False)              # 0/1/2
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="critiquing")
                                                                                  # critiquing / regenerating / done / final
    critique_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    modules_regenerated: Mapped[list | None] = mapped_column(JSON, nullable=True) # ['M3_health_radar', ...]
    challenger_model: Mapped[str | None] = mapped_column(String(60), nullable=True)
    regen_model: Mapped[str | None] = mapped_column(String(60), nullable=True)
    regen_chars: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
