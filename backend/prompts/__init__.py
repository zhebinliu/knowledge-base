"""
Prompts 包 —— 各 Agent 的 Prompt 模板

模板说明：
  - conversion:    文档转化为 Markdown 的 Prompt
  - slicing:       切片分类的 Prompt
  - qa:            RAG 问答的 Prompt
  - challenge:     挑战出题 + 评判的 Prompt
  - ltc_taxonomy:  LTC 阶段分类体系配置
"""

from prompts.conversion import build_conversion_prompt
from prompts.slicing import build_slicing_prompt
from prompts.qa import build_qa_prompt
from prompts.challenge import build_question_prompt, build_judge_prompt
from prompts.ltc_taxonomy import LTC_STAGES, INDUSTRY_TAGS, MODULE_TAGS

__all__ = [
    "build_conversion_prompt",
    "build_slicing_prompt",
    "build_qa_prompt",
    "build_question_prompt",
    "build_judge_prompt",
    "LTC_STAGES",
    "INDUSTRY_TAGS",
    "MODULE_TAGS",
]
