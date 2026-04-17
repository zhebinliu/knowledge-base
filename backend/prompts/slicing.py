from prompts.ltc_taxonomy import get_ltc_taxonomy_text, get_industry_list_text

CLASSIFICATION_PROMPT = """你是纷享销客 CRM 实施知识库管理员，请对以下知识切片进行精准分类。

## LTC 阶段定义（从业务流程前端到后端排列）
{ltc_taxonomy}

## 行业选项
{industry_list}

## 分类指南
1. ltc_stage：选择最匹配的 LTC 阶段。如果内容跨多个阶段，选主要阶段。如果与 LTC 无关，选 general。
2. ltc_stage_confidence：你对分类的确信度（0.0-1.0）。具体判断标准：
   - ≥0.9：内容明确提到该阶段关键词或典型场景
   - 0.7-0.9：内容与该阶段高度相关但未直接提及
   - 0.5-0.7：内容可能属于该阶段但也可能属于其他阶段
   - <0.5：非常不确定
3. industry：识别行业特征。通用内容选 other。
4. module：识别功能模块（如 data_migration, integration, business_flow, security 等），无明确模块留空。
5. tags：提取 2-5 个描述性标签，反映知识类型（如 best_practice, checklist, troubleshooting, methodology, case_study）。

## 待分类切片
文档标题：{doc_title}
章节路径：{section_path}
内容：
---
{chunk_content}
---

输出 JSON（不要输出任何其他内容）：
{{"ltc_stage": "delivery", "ltc_stage_confidence": 0.85, "industry": "manufacturing", "module": "data_migration", "tags": ["best_practice", "risk_management"], "reasoning": "一句话分类理由"}}"""


async def build_slicing_prompt(doc_title: str, section_path: str, chunk_content: str) -> str:
    from services.config_service import config_service
    cfg = await config_service.get("prompt_template", "CLASSIFICATION_PROMPT")
    template = cfg["template"] if cfg else CLASSIFICATION_PROMPT
    return template.format(
        ltc_taxonomy=get_ltc_taxonomy_text(),
        industry_list=get_industry_list_text(),
        doc_title=doc_title,
        section_path=section_path,
        chunk_content=chunk_content,
    )
