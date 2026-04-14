from prompts.ltc_taxonomy import get_ltc_taxonomy_text, get_industry_list_text

CLASSIFICATION_PROMPT = """你是纷享销客 CRM 项目的知识库管理员。请对以下文档切片进行分类。

## LTC 阶段定义
{ltc_taxonomy}

## 行业列表
{industry_list}

## 待分类切片
文档标题：{doc_title}
章节路径：{section_path}
内容：
---
{chunk_content}
---

请输出 JSON（不要输出其他任何内容）：
{{
  "ltc_stage": "delivery",
  "ltc_stage_confidence": 0.85,
  "industry": "manufacturing",
  "module": "data_migration",
  "tags": ["best_practice", "risk_management"],
  "reasoning": "一句话说明分类理由"
}}"""


def build_slicing_prompt(doc_title: str, section_path: str, chunk_content: str) -> str:
    return CLASSIFICATION_PROMPT.format(
        ltc_taxonomy=get_ltc_taxonomy_text(),
        industry_list=get_industry_list_text(),
        doc_title=doc_title,
        section_path=section_path,
        chunk_content=chunk_content,
    )
