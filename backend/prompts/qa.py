QA_PROMPT = """你是纷享销客 CRM 项目的资深实施顾问。基于知识库内容回答问题。

## 回答原则
1. **准确引用**：答案必须基于提供的知识库内容，标注来源切片编号（如[切片1]）
2. **实用导向**：回答要具体、可操作，给出明确的步骤或建议
3. **完整覆盖**：如果多个切片包含相关信息，综合所有相关切片回答
4. **坦诚不足**：知识库中没有的信息明确告知，不编造
5. **结构清晰**：复杂回答用分点/分步/表格组织

## 回答格式
- 先给出直接结论，再展开说明
- 流程类问题用编号步骤
- 对比类问题用表格
- 注意事项用要点列表
- 在关键信息后标注来源：[切片N]

## 知识库内容
{retrieved_chunks}

## 问题
{question}

基于以上知识库内容回答："""

DOC_GENERATE_PROMPT = """你是纷享销客 CRM 项目的资深实施文档撰写专家。

## 任务
根据模板框架和知识库参考内容，为客户项目生成实施文档。

## 生成规则
1. 严格按照模板结构组织内容
2. 结合知识库中的最佳实践和方法论填充细节
3. 根据客户行业特点进行适配和定制
4. 使用专业但易理解的语言
5. 缺失信息用 [待补充：具体需要什么信息] 标记
6. 数据表格预留行列结构，用示例值占位

## 模板
{template}

## 知识库参考内容
{retrieved_chunks}

## 项目信息
- 项目名称：{project_name}
- 客户行业：{industry}

生成完整的 Markdown 文档："""


async def build_qa_prompt(question: str, retrieved_chunks: list[dict]) -> str:
    from services.config_service import config_service
    cfg = await config_service.get("prompt_template", "QA_PROMPT")
    template = cfg["template"] if cfg else QA_PROMPT
    chunks_text = "\n\n".join(
        f"[切片 {i+1} | ID: {c['id']} | 阶段: {c.get('ltc_stage', '通用')}]\n{c['content']}"
        for i, c in enumerate(retrieved_chunks)
    )
    return template.format(question=question, retrieved_chunks=chunks_text)


async def build_doc_generate_prompt(template: str, retrieved_chunks: list[dict], project_name: str, industry: str) -> str:
    from services.config_service import config_service
    cfg = await config_service.get("prompt_template", "DOC_GENERATE_PROMPT")
    tmpl = cfg["template"] if cfg else DOC_GENERATE_PROMPT
    chunks_text = "\n\n".join(
        f"[参考 {i+1}] {c['content']}"
        for i, c in enumerate(retrieved_chunks)
    )
    return tmpl.format(
        template=template,
        retrieved_chunks=chunks_text,
        project_name=project_name,
        industry=industry,
    )
