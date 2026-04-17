CHALLENGE_QUESTION_PROMPT = """你是一位资深 CRM 项目实施顾问，正在对知识库进行质量压力测试。

## 任务
根据知识库内容生成高质量挑战问题，用于验证知识库的覆盖面和回答能力。

## 出题策略
1. **跨切片推理题**：需要综合多个切片信息才能完整回答
2. **实战场景题**：模拟真实项目中客户会问的问题
3. **边界探测题**：测试知识库在细节和边界情况上的覆盖度
4. **对比分析题**：需要对比不同方案/阶段/行业的差异
5. **决策判断题**：需要基于知识做出实施决策建议

## 质量要求
- 问题必须有明确的预期答案方向（基于提供的知识）
- 避免过于宽泛的开放式问题
- 难度分级：medium（单切片可答）、hard（需跨切片推理）、expert（需深度分析+推理）

## 当前关注的 LTC 阶段：{target_stage}

## 相关知识库切片
---
{chunks_content}
---

生成 5 个挑战问题，直接输出 JSON 数组（不要输出其他内容）：
[{{"question": "具体的实战问题", "difficulty": "hard", "ltc_stage": "{target_stage}", "challenge_type": "cross_chunk_reasoning", "expected_coverage": "简述预期答案应覆盖的要点"}}]"""

CHALLENGE_JUDGE_PROMPT = """你是独立的知识质量审查专家，负责客观评估问答对的质量。

## 评估任务
评估知识库对问题的回答质量。

## 问题
{question}

## 知识库回答
{answer}

## 参考知识切片（标准答案来源）
{source_chunks}

## 评分维度（每项 0.0-1.0）
1. **accuracy**（准确性）：回答是否与参考切片一致，有无事实错误或幻觉
2. **completeness**（完整性）：是否覆盖了问题的各个方面，有无遗漏关键信息
3. **usefulness**（实用性）：对实际 CRM 项目实施是否有具体指导价值
4. **citation_quality**（引用质量）：是否合理引用了知识库内容，而非凭空回答

## 评判标准
- overall_score = 四项均分
- overall_score >= 0.8 → decision = "pass"
- overall_score < 0.8 → decision = "fail"

先分析再评分。最后输出 JSON（不要用代码块包裹）：
{{"accuracy": 0.9, "completeness": 0.7, "usefulness": 0.85, "citation_quality": 0.8, "overall_score": 0.81, "decision": "pass", "reasoning": "简要评估理由，指出优点和不足"}}"""


async def build_question_prompt(target_stage: str, chunks: list[dict]) -> str:
    from services.config_service import config_service
    cfg = await config_service.get("prompt_template", "CHALLENGE_QUESTION_PROMPT")
    template = cfg["template"] if cfg else CHALLENGE_QUESTION_PROMPT
    chunks_text = "\n\n".join(
        f"[切片 {i+1} | {c.get('ltc_stage', '通用')}]\n{c['content']}"
        for i, c in enumerate(chunks)
    )
    return template.format(target_stage=target_stage, chunks_content=chunks_text)


async def build_judge_prompt(question: str, answer: str, source_chunks: list[dict]) -> str:
    from services.config_service import config_service
    cfg = await config_service.get("prompt_template", "CHALLENGE_JUDGE_PROMPT")
    template = cfg["template"] if cfg else CHALLENGE_JUDGE_PROMPT
    sources = "\n\n".join(
        f"[切片 {i+1} | ID: {c['id']}]\n{c['content'][:500]}"
        for i, c in enumerate(source_chunks)
    )
    return template.format(question=question, answer=answer, source_chunks=sources)
