"""
Agents 包 —— 各业务 Agent 的统一入口

功能说明：
  - converter_agent: 文档转化（Word/PDF/PPTX → Markdown）
  - slicer_agent:    文档切片 + LTC 分类
  - kb_agent:        知识库问答（RAG）
  - challenger_agent: 挑战验证（出题 + 评判）
"""

from agents.converter_agent import convert_to_markdown
from agents.slicer_agent import slice_and_classify, classify_single_chunk
from agents.kb_agent import answer_question
from agents.challenger_agent import generate_questions, judge_answer

__all__ = [
    "convert_to_markdown",
    "slice_and_classify",
    "classify_single_chunk",
    "answer_question",
    "generate_questions",
    "judge_answer",
]
