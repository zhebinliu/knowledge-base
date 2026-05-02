"""Agentic 主模块 — 项目洞察 / 调研大纲 / 调研问卷的"模块化 + 三层 agentic"实现。

设计原则:
1. 模块化驱动: 每个模块声明所需字段、字段来源、缺信息时的获取动作
2. Plan → Execute → Critic 三层流程
3. 行业场景化: industry_packs 配置化注入
4. "无效文档"产品契约: 关键模块不足 → bundle.extra.validity_status='invalid'

完整设计见 /Users/zhebin/.claude/plans/skill-zany-hopcroft.md
"""

from .runner import generate_insight, generate_survey, generate_survey_outline

__all__ = ["generate_insight", "generate_survey", "generate_survey_outline"]
