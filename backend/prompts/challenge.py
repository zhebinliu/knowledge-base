CHALLENGE_QUESTION_PROMPT = """你是资深 CRM 项目实施顾问，对知识库做质量压力测试。仅输出一个 JSON 数组，无其他文字。

## 任务
基于下方"相关知识库切片"生成 {num_questions} 道挑战问题，验证知识库的覆盖面与回答能力。

## 关键约束（违反任一条问题视为无效）
1. 问题必须能在给定切片中找到完整或部分答案——不要造切片完全无依据的问题
2. 问题指向具体场景或决策，不要宽泛开放（"如何做好实施"❌ → "数据迁移阶段如何处理历史脏数据"✓）
3. 不要生成元问题（"知识库有哪些内容"、"请总结这些切片"）
4. 题与题之间不要重复或高度相似（语义重叠 > 70% 视为重复）

## 出题策略（challenge_type 必须严格取自下表）
- `cross_chunk_reasoning`：需综合 2 个及以上切片才能完整回答
- `real_world_scenario`：模拟真实项目中客户/同事会问的具体问题
- `edge_case`：探测细节、异常、边界场景
- `comparison`：对比不同方案/阶段/行业/工具的差异
- `decision_making`：基于知识做实施决策或风险判断

## 难度分级（difficulty 必须严格取自下表）
- `medium`：单个切片可答；占比 ≤ 40%
- `hard`：需 2-3 个切片综合推理；占比 ≥ 50%
- `expert`：需深度分析 + 推理；至少 1 题，至多 2 题

## 字段规则
- `question`：一句话，必须含具体场景/对象/约束，长度 15-80 字
- `difficulty`：medium / hard / expert 之一
- `ltc_stage`：固定为 "{target_stage}"
- `challenge_type`：上述 5 种之一
- `expected_coverage`：一句话描述答案应覆盖的关键要点（用于后续评分对照），≤60 字

## 输出硬约束
1. 只输出一个 JSON 数组，不要前后说明、不要 ``` 包裹、不要 `<think>` 块
2. 数组长度恰好 {num_questions}
3. 字段顺序与示例一致

## 当前关注的 LTC 阶段：{target_stage}

## 相关知识库切片
---
{chunks_content}
---

输出 JSON 数组：
[{{"question": "客户老 CRM 中存在 30% 重复客户档案，迁移时如何识别并处理？", "difficulty": "hard", "ltc_stage": "{target_stage}", "challenge_type": "real_world_scenario", "expected_coverage": "去重策略、合并规则、人工确认流程"}}]"""

CHALLENGE_JUDGE_PROMPT = """你是独立的知识质量审查专家，客观评估问答对的质量。仅输出一个 JSON 对象，无其他文字。

## 输入
### 问题
{question}

### 知识库回答
{answer}

### 参考知识切片（评判依据）
{source_chunks}

## 评分维度（每项 0.00-1.00，保留两位小数）

### accuracy（事实准确性）
- 1.00：所有事实可在参考切片中验证，无错误
- 0.80：主要事实正确，存在 1-2 处轻微表述偏差
- 0.50：约一半事实可验证，其余无依据或错误
- 0.20：多数事实无依据或与切片矛盾
- 0.00：含明显幻觉/编造（虚构产品名、版本、字段、数字）

### completeness（覆盖完整性）
- 1.00：覆盖问题全部子项
- 0.80：覆盖主要子项，遗漏次要点
- 0.50：覆盖一半要点
- 0.20：仅触及问题表层
- 0.00：答非所问

### usefulness（实战实用性）
- 1.00：可直接落地，含具体步骤/参数/判断标准
- 0.80：方向明确但缺少 1-2 个落地细节
- 0.50：原则正确但抽象，需进一步具体化
- 0.20：仅泛泛而谈，无可操作性
- 0.00：误导或与实施实践相悖

### citation_quality（引用质量）
- 评估对象：回答中 `[切片N]` 标注的合理性
- 1.00：每个事实点都有正确引用，引用切片确实支撑该事实
- 0.80：主要事实有引用，少量遗漏
- 0.50：仅部分事实有引用，或引用切片只部分支撑
- 0.20：极少引用或引用与内容不符
- 0.00：无任何引用，或全部引用错误

## 评判中立性硬约束
1. 不以回答长度判分——长不等于好，短不等于差
2. 不以排版美观判分——表格/列表本身不加分
3. 不以语气判分——专业措辞不加分，口语化不减分
4. 参考切片之间冲突时：以多数切片支持的事实为准；只有一条切片支撑且回答采纳，记 accuracy ≥ 0.80
5. 回答正确指出"知识库未覆盖"且确实未覆盖：completeness 不扣分，记 ≥ 0.80

## 计算与判定
- overall_score = (accuracy + completeness + usefulness + citation_quality) / 4，保留两位小数
- decision：overall_score ≥ 0.80 → "pass"；否则 → "fail"
- decision 取值只能是 "pass" 或 "fail"，不要用 accept/reject/auto_accept

## 输出硬约束
1. 只输出一个 JSON 对象，不要前后说明、不要 ``` 包裹、不要 `<think>` 块
2. 所有分析过程写入 reasoning 字段（一段话，≤120 字），不在 JSON 外输出任何文字
3. reasoning 中要明确指出主要扣分点（若有）

输出 JSON：
{{"accuracy": 0.90, "completeness": 0.70, "usefulness": 0.85, "citation_quality": 0.80, "overall_score": 0.81, "decision": "pass", "reasoning": "事实与切片一致并正确引用；遗漏对回滚策略的说明，导致完整性扣分"}}"""


CHALLENGE_QUESTION_FREE_PROMPT = """你是资深 CRM 项目实施顾问，在设计真实项目场景下的压力测试题。仅输出一个 JSON 数组，无其他文字。

## 任务
围绕 LTC 阶段"{target_stage}"生成 {num_questions} 道挑战问题，模拟真实客户/同事会抛出的硬问题。不依赖任何现成切片——大胆构造具体、真实、常见的业务场景。

## 关键约束（违反任一条问题视为无效）
1. 必须是实施顾问/交付经理在项目现场真会遇到的问题
2. 问题要有具体场景/角色/数字/约束，不要抽象泛谈（反例："如何做好客户管理"）
3. 不要生成元问题（"知识库覆盖什么"、"请总结这一阶段"）
4. 题与题之间不要重复或高度相似（语义重叠 > 70% 视为重复）
5. 问题不含对"知识库""切片""文档"的引用——像真实客户提问

## 出题策略（challenge_type 必须严格取自下表）
- `real_world_scenario`：模拟真实项目中客户/同事提出的具体问题
- `edge_case`：探测细节、异常、边界场景（如"活动突然失败""审批超时")
- `comparison`：对比不同方案/行业/工具的差异
- `decision_making`：基于业务目标做实施决策或风险判断
- `cross_chunk_reasoning`：需综合多个维度（流程 + 权限 + 数据）才能完整回答

## 难度分级（difficulty 必须严格取自下表）
- `medium`：单一主题可答；占比 ≤ 30%
- `hard`：需跨主题综合推理；占比 ≥ 50%
- `expert`：需深度判断/权衡；至少 1 题，至多 2 题

## 字段规则
- `question`：一句话，必须含具体场景/对象/约束，长度 15-80 字
- `difficulty`：medium / hard / expert 之一
- `ltc_stage`：固定为 "{target_stage}"
- `challenge_type`：上述 5 种之一
- `expected_coverage`：一句话描述答案应覆盖的关键要点，≤60 字

## 输出硬约束
1. 只输出一个 JSON 数组，不要前后说明、不要 ``` 包裹、不要 `<think>` 块
2. 数组长度恰好 {num_questions}
3. 字段顺序与示例一致

## 当前关注的 LTC 阶段：{target_stage}

输出 JSON 数组：
[{{"question": "金融客户要求销售跟进记录必须留痕到分钟，如何在商机阶段落地？", "difficulty": "hard", "ltc_stage": "{target_stage}", "challenge_type": "real_world_scenario", "expected_coverage": "跟进字段设计、填写规则、审计留痕与报表核查"}}]"""


async def build_question_free_prompt(target_stage: str, num_questions: int = 5) -> str:
    from services.config_service import config_service
    cfg = await config_service.get("prompt_template", "CHALLENGE_QUESTION_FREE_PROMPT")
    template = cfg["template"] if cfg else CHALLENGE_QUESTION_FREE_PROMPT
    return template.format(target_stage=target_stage, num_questions=num_questions)


async def build_question_prompt(target_stage: str, chunks: list[dict], num_questions: int = 5) -> str:
    from services.config_service import config_service
    cfg = await config_service.get("prompt_template", "CHALLENGE_QUESTION_PROMPT")
    template = cfg["template"] if cfg else CHALLENGE_QUESTION_PROMPT
    chunks_text = "\n\n".join(
        f"[切片 {i+1} | {c.get('ltc_stage', '通用')}]\n{c['content']}"
        for i, c in enumerate(chunks)
    )
    return template.format(
        target_stage=target_stage,
        chunks_content=chunks_text,
        num_questions=num_questions,
    )


async def build_judge_prompt(question: str, answer: str, source_chunks: list[dict]) -> str:
    from services.config_service import config_service
    cfg = await config_service.get("prompt_template", "CHALLENGE_JUDGE_PROMPT")
    template = cfg["template"] if cfg else CHALLENGE_JUDGE_PROMPT
    sources = "\n\n".join(
        f"[切片 {i+1} | ID: {c['id']}]\n{c['content'][:500]}"
        for i, c in enumerate(source_chunks)
    )
    return template.format(question=question, answer=answer, source_chunks=sources)
