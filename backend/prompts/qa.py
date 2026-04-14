QA_PROMPT = """你是纷享销客 CRM 项目的知识库助手。根据知识库内容回答问题。

规则：
1. 仅基于提供的知识库内容回答，不编造
2. 没有相关信息就明确告知
3. 标注引用来源（切片 ID）
4. 回答要实用、具体、可操作

知识库内容：
{retrieved_chunks}

问题：{question}
"""

DOC_GENERATE_PROMPT = """你是纷享销客 CRM 项目的文档撰写专家。
根据知识库内容和模板生成文档。

模板：{template}
知识库内容：{retrieved_chunks}
项目名称：{project_name}
客户行业：{industry}

请生成 Markdown 文档。缺失部分用 [待补充：xxx] 标记。
"""


def build_qa_prompt(question: str, retrieved_chunks: list[dict]) -> str:
    chunks_text = "\n\n".join(
        f"[切片 {i+1} | ID: {c['id']} | {c.get('ltc_stage', '')}]\n{c['content']}"
        for i, c in enumerate(retrieved_chunks)
    )
    return QA_PROMPT.format(question=question, retrieved_chunks=chunks_text)


def build_doc_generate_prompt(template: str, retrieved_chunks: list[dict], project_name: str, industry: str) -> str:
    chunks_text = "\n\n".join(c["content"] for c in retrieved_chunks)
    return DOC_GENERATE_PROMPT.format(
        template=template,
        retrieved_chunks=chunks_text,
        project_name=project_name,
        industry=industry,
    )
