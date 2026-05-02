"""项目库：Project 模型。文档通过 nullable FK 关联，不破坏老数据。"""
import uuid
from datetime import datetime, timezone, date
from sqlalchemy import String, Text, Date, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


from services._time import utcnow_naive as _utcnow


# 文档类型枚举（在代码层面收敛；DB 用 VARCHAR 不强约束以便后续扩展）
DOC_TYPES = (
    # 原有 5 种(沿用)
    "requirement_research",     # 需求调研
    "meeting_notes",            # 会议纪要
    "solution_design",          # 方案设计
    "test_case",                # 测试用例
    "user_manual",              # 用户手册
    # 项目洞察 v3 新增 7 种(实际项目实施场景下顾问手里的核心资料)
    "sow",                      # SOW 需求说明书 ★
    "system_integration",       # 系统集成清单 ★
    "contract",                 # 项目合同(产品 + 账号数) ★
    "handover",                 # 交接单(背景 + 目标) ★
    "stakeholder_map",          # 组织架构 + 干系人图谱
    "presales_solution",        # 售前解决方案
    "presales_survey",          # 售前调研问卷
    "extra_reference",          # 附加参考文档(用户在清单里手动加进来的额外资料)
)

DOC_TYPE_LABELS = {
    "requirement_research": "需求调研",
    "meeting_notes":        "会议纪要",
    "solution_design":      "方案设计",
    "test_case":            "测试用例",
    "user_manual":          "用户手册",
    "sow":                  "SOW 需求说明书",
    "system_integration":   "系统集成清单",
    "contract":             "项目合同",
    "handover":             "交接单",
    "stakeholder_map":      "组织架构 / 干系人图谱",
    "presales_solution":    "售前解决方案",
    "presales_survey":      "售前调研问卷",
    "extra_reference":      "附加参考",
}


# 虚拟产物 — 不是用户上传的文档,而是系统引导/自动生成的"准物"
# 在 DocChecklist 里跟文档并列展示,但走不同填充路径
VIRTUAL_ARTIFACTS = (
    "v_success_metrics",        # 成功指标(引导问卷,客户挑选项)
    "v_risk_alert",             # 风险预警(系统从 KB / industry pack 推通用清单)
    "v_guided_questionnaire",   # 引导问卷(占位,后续补)
)

VIRTUAL_ARTIFACT_LABELS = {
    "v_success_metrics":      "成功指标",
    "v_risk_alert":           "风险预警",
    "v_guided_questionnaire": "引导问卷",
}

VIRTUAL_ARTIFACT_DESCRIPTIONS = {
    "v_success_metrics":      "5-8 道带选项的题(销售额/周期/转化率...),客户挑 3 分钟搞定",
    "v_risk_alert":           "系统从行业模板 + KB 推 8-12 条典型风险,客户勾选适用",
    "v_guided_questionnaire": "针对该项目的引导式追问问卷",
}


# 各阶段(stage)需要的文档清单
# key 跟 stage_flow.STAGES 的 key 对齐
STAGE_DOC_REQUIREMENTS: dict[str, dict] = {
    "insight": {
        "required_docs":    ["sow", "system_integration", "contract", "handover"],
        "recommended_docs": ["stakeholder_map", "presales_solution", "presales_survey"],
        "virtual_required": ["v_success_metrics"],
        "virtual_recommended": ["v_risk_alert"],
    },
    # 其他 stage 暂未要求(留待后续配置)
}


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    customer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # 行业标签，枚举见 ltc_taxonomy.INDUSTRIES
    industry: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # JSON 存涉及模块列表，元素来自 ltc_taxonomy.MODULE_TAGS
    modules: Mapped[list | None] = mapped_column(JSON, nullable=True)
    kickoff_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_profile: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)
