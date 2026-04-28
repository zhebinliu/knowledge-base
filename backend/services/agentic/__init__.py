"""Agentic v2 — 项目洞察 / 调研问卷的"模块化 + 三层 agentic"重构(旁路验证版本)。

设计原则:
1. 模块化驱动: 每个模块声明所需字段、字段来源、缺信息时的获取动作
2. Plan → Execute → Critic 三层流程
3. 行业场景化: industry_packs 配置化注入
4. "无效文档"产品契约: 关键模块不足 → bundle.extra.validity_status='invalid'

完整设计见 /Users/zhebin/.claude/plans/skill-zany-hopcroft.md
"""

from .runner import generate_insight_v2, generate_survey_v2, generate_outline_v2

__all__ = ["generate_insight_v2", "generate_survey_v2", "generate_outline_v2"]
