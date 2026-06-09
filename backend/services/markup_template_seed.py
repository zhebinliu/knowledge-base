"""预置会议纪要版面模板种子数据。

在 main.py startup 中调用 seed_markup_templates() 幂等写入。
包含 6 个 SaaS 交付项目专用会议纪要模板，按 name 去重。
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.markup_template import MarkupTemplate

logger = logging.getLogger(__name__)


# ── 6 个预置 SaaS 交付项目会议模板 ──────────────────────────────────────────
# 占位符说明（与 render_template 对齐）：
#   {{title}}         会议标题
#   {{date}}          会议日期
#   {{time}}          会议时间
#   {{location}}      会议地点
#   {{host}}          主持人
#   {{recorder}}      记录人
#   {{attendees}}     参会人员列表
#   {{summary}}       会议摘要
#   {{key_points}}    关键议题（编号列表）
#   {{decisions}}     决议事项（无序列表）
#   {{action_items}}  待办事项（表格）
#   {{unresolved}}    未决问题（无序列表）
#   {{requirements}}  需求清单（表格）
#   {{stakeholders}}  干系人列表（表格）
#   {{transcript_summary}} 转录摘要
# ────────────────────────────────────────────────────────────────────────────

PRESET_TEMPLATES = [
    {
        "name": "项目启动会暨实施方案评审",
        "description": "SaaS交付项目启动会，明确实施范围、里程碑对齐、组织架构与沟通机制，适用场景：项目启动/里程碑评审",
        "content": """# 【会议纪要】{{title}}

> 会议时间：{{date}} {{time}} | 会议形式：{{location}}
> 召集人：{{host}} | 记录人：{{recorder}}
> 客户出席人：{{attendees}}

---

## 1. 会议目标与背景

{{summary}}

---

## 2. 核心议题与达成共识

{{key_points}}

---

> 💡 **关键技术决议**
> {{decisions}}

---

## 3. Action Items（待办事项跟踪）

{{action_items}}

---

> *SaaS 交付项目 · 项目启动阶段 | 文档由会议纪要模板自动生成*
""",
    },
    {
        "name": "交付进度周例会纪要",
        "description": "SaaS交付项目周例会，回顾本周进展、规划下周工作、识别进度风险，适用场景：每周交付进度同步",
        "content": """# 【周报纪要】{{title}}

> 会议时间：{{date}} {{time}} | 会议地点：{{location}}
> 主导人：{{host}} | 参会人员：{{attendees}}

---

## 1. 本周已完成交付进展

{{key_points}}

---

## 2. 下周工作计划与排期

{{decisions}}

---

> ⚠️ **进度预警/风险提示**
> {{unresolved}}

---

## 3. 任务分配与跟进

{{action_items}}

---

> *SaaS 交付项目 · 进度周报 | 文档由会议纪要模板自动生成*
""",
    },
    {
        "name": "核心业务流程变更与风险澄清会",
        "description": "SaaS交付项目风险阻碍协同解决会，聚焦重大变更影响分析、方案比选与管理层决策，适用场景：紧急风险/阻碍解决",
        "content": """# 【专项会议】{{title}}

> 会议时间：{{date}} {{time}} | 决策高管：{{attendees}}
> **问题背景**：{{summary}}

---

## 1. 关键议题讨论摘要

{{key_points}}

---

> 📌 **最终管理层决议**
> {{decisions}}

---

## 2. 紧急执行计划与责任矩阵

{{action_items}}

---

> *SaaS 交付项目 · 风险管控 | 紧急程度：高 | 文档由会议纪要模板自动生成*
""",
    },
    {
        "name": "需求澄清与基线锁定会",
        "description": "SaaS交付项目需求定标会，澄清核心业务需求、锁定SRS基线、明确Out of Scope边界，适用场景：需求评审/基线锁定",
        "content": """# 【需求定标】{{title}}

> 会议时间：{{date}} {{time}} | 会议形式：{{location}}
> 决策人（Sponsor）：{{stakeholders}}
> 核心参会人：{{attendees}}

---

## 1. 会议目标

{{summary}}

---

## 2. 需求对齐矩阵与 SaaS 实现方案

{{requirements}}

---

> ⚠️ **显式不包含范围（Out of Scope）**
> {{unresolved}}

---

## 3. 下阶段行动计划

{{action_items}}

---

> *SaaS 交付项目 · 需求基线 | 锁定状态：已基线化 | 文档由会议纪要模板自动生成*
""",
    },
    {
        "name": "UAT用户验收测试复盘会",
        "description": "SaaS交付项目UAT每日复盘会，追踪测试用例执行率、致命缺陷销项、缺陷判定标准对齐，适用场景：UAT测试阶段每日复盘",
        "content": """# 【UAT复盘】{{title}}

> 复盘时间：{{date}} {{time}} | 当前阶段：{{location}}
> 会议主持：{{host}} | 参会群体：{{attendees}}

---

## 1. 今日 UAT 核心执行指标

{{key_points}}

---

## 2. 缺陷专项跟踪

{{action_items}}

---

> 💡 **判定界限提示**
> {{decisions}}

---

> *SaaS 交付项目 · UAT 阶段 | 文档由会议纪要模板自动生成*
""",
    },
    {
        "name": "系统割接方案演练会",
        "description": "SaaS交付项目上线割接联合沙盘推演，锁定Cutover Runbook与无条件回滚方案，适用场景：上线前最后一轮割接演练",
        "content": """# 【系统割接】{{title}}

> 会议时间：{{date}} {{time}} | 会议性质：上线前联合沙盘推演与 Runbook 锁定
> 联合总指挥：{{stakeholders}}
> 应急响应组：{{attendees}}

---

## 1. 割接核心时间节点编排（Cutover Runbook）

{{action_items}}

---

## 2. 关键决议与风险预案

{{decisions}}

---

> 🚨 **兜底保障：无条件回滚方案**
> {{unresolved}}

---

> *SaaS 交付项目 · 系统割接 | 文档由会议纪要模板自动生成*
""",
    },
]

# 当前有效的预置模板名称集合（用于清理旧模板）
_PRESET_NAMES = {t["name"] for t in PRESET_TEMPLATES}


async def seed_markup_templates(db: AsyncSession) -> dict:
    """幂等写入预置模板（按 name 去重，已存在则跳过）。

    同时清理不再属于 PRESET_TEMPLATES 的旧内置模板。
    """
    created = 0
    cleaned = 0

    # 1) 清理旧内置模板：名称不在当前 PRESET_TEMPLATES 中的 is_builtin 模板
    stale_templates = (
        await db.scalars(
            select(MarkupTemplate).where(
                MarkupTemplate.is_builtin == True,  # noqa: E712
                MarkupTemplate.name.notin_(_PRESET_NAMES),
            )
        )
    ).all()
    for stale in stale_templates:
        await db.delete(stale)
        cleaned += 1
    if cleaned > 0:
        await db.flush()
        logger.info("stale_markup_templates_cleaned", count=cleaned, names=[t.name for t in stale_templates])

    # 2) 写入新预设模板
    for tpl_data in PRESET_TEMPLATES:
        existing = (
            await db.scalars(
                select(MarkupTemplate).where(
                    MarkupTemplate.name == tpl_data["name"],
                    MarkupTemplate.is_builtin == True,  # noqa: E712
                )
            )
        ).first()
        if existing:
            continue

        tpl = MarkupTemplate(
            name=tpl_data["name"],
            description=tpl_data["description"],
            content=tpl_data["content"],
            category="preset",
            source_format="markdown",
            is_builtin=True,
        )
        db.add(tpl)
        created += 1

    if created > 0 or cleaned > 0:
        await db.commit()
        logger.info("markup_templates_seeded", created=created, cleaned=cleaned)

    return {"seeded": created, "cleaned": cleaned, "preset_count": len(PRESET_TEMPLATES)}
