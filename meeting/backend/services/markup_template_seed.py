"""预置会议纪要版面模板种子数据。

在 main.py startup 中调用 seed_markup_templates() 幂等写入。
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.markup_template import MarkupTemplate

logger = logging.getLogger(__name__)


PRESET_TEMPLATES = [
    {
        "name": "标准企业纪要",
        "description": "适用于正式企业会议，包含标题、参会人员、摘要、关键议题、决议、待办、未决问题",
        "content": """# {{title}}

> **会议时间**：{{date}} {{time}}
> **会议地点**：{{location}}
> **主持人**：{{host}}
> **记录人**：{{recorder}}

---

## 参会人员

{{attendees}}

---

## 会议摘要

{{summary}}

---

## 关键议题

{{key_points}}

---

## 决议事项

{{decisions}}

---

## 待办事项

{{action_items}}

---

## 未决问题

{{unresolved}}

---

## 干系人

{{stakeholders}}
""",
    },
    {
        "name": "技术评审纪要",
        "description": "适用于技术方案评审会议，突出需求清单和技术决策",
        "content": """# {{title}} · 技术评审

| 项目 | 内容 |
|------|------|
| **日期** | {{date}} |
| **时间** | {{time}} |
| **主持人** | {{host}} |
| **参会人** | {{attendees}} |

---

## 一、会议摘要

{{summary}}

---

## 二、讨论要点

{{key_points}}

---

## 三、技术决策

{{decisions}}

---

## 四、需求清单

{{requirements}}

---

## 五、行动事项

{{action_items}}

---

## 六、待确认问题

{{unresolved}}
""",
    },
    {
        "name": "项目站会纪要",
        "description": "适用于每日/每周项目站会，简洁高效，聚焦进展和阻塞",
        "content": """# {{title}}

**日期**：{{date}} | **时间**：{{time}}
**主持人**：{{host}}

---

## 参与人员

{{attendees}}

---

## 本次摘要

{{summary}}

---

## 进展与讨论

{{key_points}}

---

## 决议

{{decisions}}

---

## 待办 & 责任人

{{action_items}}

---

## 阻塞与风险

{{unresolved}}
""",
    },
    {
        "name": "决策记录模板",
        "description": "适用于重大决策会议，详细记录决策背景、选项分析和最终决议",
        "content": """# {{title}} · 决策记录

---

| 项目 | 详情 |
|------|------|
| **日期** | {{date}} {{time}} |
| **地点** | {{location}} |
| **主持人** | {{host}} |
| **记录人** | {{recorder}} |
| **参会人员** | {{attendees}} |

---

## 决策背景

{{summary}}

---

## 议题讨论

{{key_points}}

---

## 最终决议

{{decisions}}

---

## 后续行动

{{action_items}}

---

## 未决与风险

{{unresolved}}

---

## 相关需求

{{requirements}}

---

## 干系人签名

{{stakeholders}}

---

> *本文档由会议纪要模板自动生成*
""",
    },
]


async def seed_markup_templates(db: AsyncSession) -> dict:
    """幂等写入预置模板（按 name 去重，已存在则跳过）。"""
    created = 0
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

    if created > 0:
        await db.commit()
        logger.info("markup_templates_seeded", created=created)

    return {"seeded": created, "preset_count": len(PRESET_TEMPLATES)}
