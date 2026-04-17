from prompts.ltc_taxonomy import (
    get_ltc_taxonomy_text,
    get_industry_list_text,
    get_module_list_text,
)

CLASSIFICATION_PROMPT = """你是纷享销客 CRM 实施知识库管理员，对知识切片进行精准分类。仅输出一个 JSON 对象，无其他文字。

## LTC 阶段（业务流程从前到后）
{ltc_taxonomy}

## 行业枚举（industry 必须取自此列表）
{industry_list}

## 模块枚举（module 必须取自此列表，或留空字符串）
{module_list}

## 标签词表（tags 只能从下表取值）
- best_practice：最佳实践、经验总结
- checklist：检查清单、必做事项
- troubleshooting：问题排查、故障处理
- methodology：方法论、框架、理论
- case_study：案例分析、客户故事
- sop：标准操作流程
- template：模板、样例、填写示范
- faq：问答对、常见问题
- policy：规则、规范、制度、合规
- config：配置说明、参数、字段定义
- integration：对接、集成、接口
- risk：风险、注意事项、坑点

## 字段规则

### ltc_stage（必填，单值）
- 取值必须严格来自上方 LTC 阶段 key（lead/opportunity/quote/contract/customer/order/delivery/payment/general）
- 跨多阶段时选"内容占比最大"的主导阶段
- 与 LTC 无关或纯产品/技术/通用内容 → general
- 目录页、版本说明、空白占位、纯页眉页脚 → general 且 ltc_stage_confidence ≤ 0.30

### ltc_stage_confidence（必填，0.00-1.00，保留两位小数）
锚点：
- 0.90-1.00：明确出现该阶段关键词且场景典型（例："数据迁移方案" → delivery 0.95）
- 0.70-0.89：强业务相关但未直接出现关键词（例："老系统数据清洗策略" → delivery 0.80）
- 0.50-0.69：可能属于该阶段也可能属于相邻阶段（例："验收前的客户培训" 可能 delivery 也可能 customer）
- 0.30-0.49：仅微弱相关
- 0.00-0.29：几乎无关或为无价值内容

### industry（必填，单值）
- 严格来自"行业枚举"
- 内容针对单一行业 → 该行业；跨行业/通用/不确定 → other

### module（选填）
- 严格来自"模块枚举"，或留空字符串 ""
- 严禁自创、严禁中文、严禁多选、严禁猜测

### tags（必填，2-5 个）
- 严格来自"标签词表"，按相关性从高到低排列，不重复
- 严禁自创新标签

### reasoning（必填，一句话，≤40 字）
- 仅说明 ltc_stage 判定依据，不解释其他字段

## 输出硬约束
1. 只输出一个 JSON 对象，不要前后说明、不要 ``` 包裹、不要 `<think>` 块
2. 所有枚举字段大小写、下划线必须与列表完全一致
3. 任意枚举字段越界 → 切片会被强制降级为 general/other，分类作废

## 待分类切片
文档标题：{doc_title}
章节路径：{section_path}
内容：
---
{chunk_content}
---

输出 JSON：
{{"ltc_stage": "delivery", "ltc_stage_confidence": 0.85, "industry": "manufacturing", "module": "data_migration", "tags": ["best_practice", "risk"], "reasoning": "讨论制造业数据迁移的字段映射与风险"}}"""


async def build_slicing_prompt(doc_title: str, section_path: str, chunk_content: str) -> str:
    from services.config_service import config_service
    cfg = await config_service.get("prompt_template", "CLASSIFICATION_PROMPT")
    template = cfg["template"] if cfg else CLASSIFICATION_PROMPT
    return template.format(
        ltc_taxonomy=get_ltc_taxonomy_text(),
        industry_list=get_industry_list_text(),
        module_list=get_module_list_text(),
        doc_title=doc_title or "（无标题）",
        section_path=section_path or "（无章节路径）",
        chunk_content=chunk_content,
    )
