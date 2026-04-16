CHALLENGE_QUESTION_PROMPT = """你是一位资深的 CRM 项目顾问，正在对知识库进行质量审查。

根据以下知识库内容，生成有挑战性的问题：
1. 需要跨切片推理才能回答（不能从单一切片直接找到答案）
2. 模拟真实项目场景
3. 覆盖边界情况

当前关注的 LTC 阶段：{target_stage}
相关知识库切片：
---
{chunks_content}
---

请生成 5 个问题，输出 JSON（不要输出其他任何内容）：
[
  {{
    "question": "问题内容",
    "difficulty": "hard",
    "ltc_stage": "delivery",
    "challenge_type": "boundary_case"
  }}
]"""

CHALLENGE_JUDGE_PROMPT = """你是独立的知识质量审查专家。评估以下问答对。

问题：{question}
回答：{answer}
引用切片：{source_chunks}

评估维度（每项 0-1）：
- accuracy：事实是否正确，有无幻觉
- completeness：是否充分回答所有方面
- usefulness：对实际项目是否有指导价值
- citation_quality：是否合理引用了知识库内容

输出 JSON（不要输出其他任何内容）：
{{
  "accuracy": 0.9,
  "completeness": 0.7,
  "usefulness": 0.85,
  "citation_quality": 0.8,
  "overall_score": 0.81,
  "decision": "pending_review",
  "reasoning": "评估理由"
}}

decision 规则：
- overall_score >= 0.8 → "pass"
- overall_score < 0.8 → "fail"
"""


def build_question_prompt(target_stage: str, chunks: list[dict]) -> str:
    chunks_text = "\n\n".join(f"[{c.get('ltc_stage', '')}] {c['content']}" for c in chunks)
    return CHALLENGE_QUESTION_PROMPT.format(target_stage=target_stage, chunks_content=chunks_text)


def build_judge_prompt(question: str, answer: str, source_chunks: list[dict]) -> str:
    sources = "\n".join(f"- {c['id']}: {c['content'][:200]}..." for c in source_chunks)
    return CHALLENGE_JUDGE_PROMPT.format(question=question, answer=answer, source_chunks=sources)
