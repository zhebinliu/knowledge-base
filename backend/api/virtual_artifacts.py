"""虚拟产物(Virtual Artifacts) API。

跟"上传文档"并列的非文档型物 — 系统引导/自动生成,客户填问卷或勾选清单:
- v_success_metrics  — 成功指标(8 题带选项)
- v_risk_alert        — 风险预警(从 industry_pack 推通用清单,客户勾选)
- v_guided_questionnaire — 引导问卷(占位,后续补)

前端复用 V2GapFiller 组件渲染:GET 拿 prompts → 用户填 → POST 提交合并到 brief.fields。
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from models import async_session_maker
from models.project import Project
from models.project_brief import ProjectBrief
from services.auth import get_current_user, require_admin
from services.agentic.industry_packs import get_pack

logger = structlog.get_logger()
router = APIRouter()


# ── 成功指标问卷 — 静态题库 ─────────────────────────────────────────────────────

SUCCESS_METRICS_PROMPTS = [
    {
        "field_key": "success_metric_revenue",
        "field_label": "业务核心指标(可多选)",
        "field_type": "list",
        "multi": True,
        "required": True,
        "question": "项目结束后,你最希望提升的核心业务指标是?",
        "options": [
            "销售额 / 业绩增长",
            "销售周期缩短",
            "线索→签单 转化率提升",
            "客户复购 / 续约率提升",
            "客单价提升",
            "回款及时率",
            "新客户获取数",
            "渠道营收占比",
        ],
    },
    {
        "field_key": "success_metric_efficiency",
        "field_label": "效率类指标",
        "field_type": "list",
        "multi": True,
        "required": False,
        "question": "你想通过 CRM 提升哪些「效率」?",
        "options": [
            "销售人均产能",
            "报价响应速度",
            "审批流程缩短",
            "数据录入工作量减少",
            "跨部门协同效率",
            "客户响应时长",
        ],
    },
    {
        "field_key": "success_metric_management",
        "field_label": "管理类指标",
        "field_type": "list",
        "multi": True,
        "required": False,
        "question": "管理层最想看到 CRM 提供的能力是?",
        "options": [
            "销售漏斗可视化",
            "团队业绩排名",
            "商机预测准确度",
            "客户健康度评估",
            "渠道经销商透视",
            "数据驱动决策",
        ],
    },
    {
        "field_key": "success_metric_target_pct",
        "field_label": "量化目标(可填具体数字)",
        "field_type": "text",
        "multi": False,
        "required": True,
        "question": "Top 3 指标的具体提升目标?(例:销售额年增 30%、周期缩短 20%、转化率从 15% 到 22%)",
        "options": [],
    },
    {
        "field_key": "success_metric_horizon",
        "field_label": "见效时间预期",
        "field_type": "text",
        "multi": False,
        "required": True,
        "question": "什么时候看到效果是合理的?",
        "options": [
            "上线后 1 个月内",
            "上线后 3 个月",
            "上线后 6 个月",
            "上线后 12 个月",
            "分阶段(短/中/长期)",
        ],
    },
    {
        "field_key": "success_metric_measurement",
        "field_label": "如何衡量",
        "field_type": "text",
        "multi": False,
        "required": False,
        "question": "通过什么方式判断目标达成?",
        "options": [
            "CRM 系统报表自动出",
            "财务月报 / 季报对比",
            "业务部门主观评价",
            "客户满意度调研",
            "暂时没想好",
        ],
    },
    {
        "field_key": "success_metric_blocker",
        "field_label": "可能的阻碍",
        "field_type": "list",
        "multi": True,
        "required": False,
        "question": "你担心达不成目标的最大障碍是?",
        "options": [
            "销售不愿用 / 推广阻力",
            "数据不全 / 质量差",
            "流程跟系统不匹配",
            "管理层注意力被拉走",
            "竞争对手挤压",
            "外部市场变化",
        ],
    },
]


# ── 通用风险清单 — 从 industry_pack 推 + 通用 fallback ──────────────────────────

UNIVERSAL_RISK_OPTIONS = [
    "范围蔓延 / 镀金",
    "推广阻力 / 采纳率低",
    "数据迁移质量",
    "集成复杂度(ERP/MES/PLM)",
    "时间压力 / 上线延期",
    "预算超支",
    "关键人离场",
    "客户内部协调失败",
    "需求变更频繁",
    "性能 / 稳定性",
]


def _build_risk_prompts(industry: str | None) -> list[dict]:
    """风险预警:从行业包 pain_points 拼通用清单,客户勾「适用/不适用」。"""
    pack = get_pack(industry)
    industry_risks: list[str] = []
    if pack and pack.pain_points:
        # industry_pack 的痛点也是常见风险源
        industry_risks = list(pack.pain_points)[:8]
    all_options = list(dict.fromkeys(UNIVERSAL_RISK_OPTIONS + industry_risks))
    return [
        {
            "field_key": "risks_acknowledged",
            "field_label": "适用风险(已知会发生)",
            "field_type": "list",
            "multi": True,
            "required": True,
            "question": "下列哪些风险在你这个项目里**真的存在**?(可多选)",
            "options": all_options,
        },
        {
            "field_key": "risks_mitigated",
            "field_label": "已规避(已有应对计划)",
            "field_type": "list",
            "multi": True,
            "required": False,
            "question": "哪些风险你已经有应对计划?(从上面适用风险里挑,留作对照)",
            "options": all_options,
        },
        {
            "field_key": "risks_top_concern",
            "field_label": "最担心的 1-3 个",
            "field_type": "list",
            "multi": True,
            "required": True,
            "question": "如果只能优先处理 3 个,选哪些?",
            "options": all_options,
        },
    ]


# ── Schemas ────────────────────────────────────────────────────────────────────

class SubmitVirtualBody(BaseModel):
    fields: dict     # {field_key: BriefFieldCell or 裸值}


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/{vkey}", dependencies=[Depends(get_current_user)])
async def get_virtual(vkey: str, project_id: str):
    """返回虚拟物的「问题清单 + 当前已填值」。前端用 V2GapFiller 渲染。"""
    proj = None
    if project_id:
        async with async_session_maker() as s:
            proj = await s.get(Project, project_id)
    industry = (proj.industry if proj else None)

    if vkey == "v_success_metrics":
        title = "成功指标"
        description = "5-8 道带选项,挑你最关注的指标 — 提交后自动写入项目要点"
        prompts_raw = SUCCESS_METRICS_PROMPTS
    elif vkey == "v_risk_alert":
        title = "风险预警"
        description = "系统从行业经验推了一份通用风险清单,你勾选哪些适用、哪些已规避"
        prompts_raw = _build_risk_prompts(industry)
    else:
        raise HTTPException(404, f"未知虚拟物:{vkey}")

    # 加上 module_key / module_title / necessity(对齐 V2GapFiller 期望的 V2GapPrompt 结构)
    prompts = [
        {
            **p,
            "module_key":   f"virtual_{vkey}",
            "module_title": title,
            "necessity":    "critical" if p.get("required") else "optional",
            "action":       "ask_user",
            "detail":       p["question"],
        }
        for p in prompts_raw
    ]

    # 拉当前 brief 已填值,前端可显示已选状态
    current_values: dict = {}
    if project_id:
        async with async_session_maker() as s:
            row = (await s.execute(
                select(ProjectBrief).where(
                    ProjectBrief.project_id == project_id,
                    ProjectBrief.output_kind == "insight_v2",
                )
            )).scalar_one_or_none()
        if row and row.fields:
            for p in prompts:
                cell = row.fields.get(p["field_key"])
                if cell:
                    current_values[p["field_key"]] = cell

    return {
        "vkey": vkey,
        "title": title,
        "description": description,
        "ask_user_prompts": prompts,
        "current_values": current_values,
    }


@router.post("/{vkey}/submit", dependencies=[Depends(get_current_user)])
async def submit_virtual(vkey: str, project_id: str, body: SubmitVirtualBody):
    """合并答案到 brief.fields。不触发生成,只入库。"""
    if vkey not in ("v_success_metrics", "v_risk_alert", "v_guided_questionnaire"):
        raise HTTPException(404, f"未知虚拟物:{vkey}")
    if not project_id:
        raise HTTPException(400, "缺 project_id")

    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    from sqlalchemy.orm.attributes import flag_modified

    async with async_session_maker() as s:
        row = (await s.execute(
            select(ProjectBrief).where(
                ProjectBrief.project_id == project_id,
                ProjectBrief.output_kind == "insight_v2",
            )
        )).scalar_one_or_none()
        existing = (row.fields if row else {}) or {}
        merged = dict(existing)
        for fk, val in (body.fields or {}).items():
            # 用户答案规范化:接受裸值或 cell 结构
            if isinstance(val, dict) and "value" in val:
                cell = val
            else:
                cell = {"value": val}
            cell.setdefault("confidence", "high")
            cell.setdefault("sources", [{"type": "virtual", "ref": vkey, "snippet": "用户填问卷"}])
            cell["edited_at"] = now_iso
            merged[fk] = cell

        if row:
            row.fields = merged
            flag_modified(row, "fields")
        else:
            s.add(ProjectBrief(project_id=project_id, output_kind="insight_v2", fields=merged))
        await s.commit()

    logger.info("virtual_submitted", vkey=vkey, project_id=project_id, fields_n=len(body.fields or {}))
    return {"ok": True, "vkey": vkey, "fields_saved": len(body.fields or {})}
