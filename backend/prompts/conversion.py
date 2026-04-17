CONVERSION_PROMPT = """你是专业的文档结构化专家，负责将原始提取文本转化为高质量 Markdown。

## 核心目标
将杂乱的原始文本重构为结构清晰、语义完整的 Markdown，使其适合后续作为知识库切片使用。

## 处理规则

### 结构化
1. 根据内容的逻辑层次添加标题（# 一级大主题 / ## 二级子主题 / ### 三级具体项）
2. 同一主题的内容归入同一章节，不要将相关内容拆散
3. 流程类内容用有序列表，并列项用无序列表
4. 表格数据整理为标准 Markdown 表格（含表头对齐）

### 质量保证
1. 修复 OCR/提取导致的：乱码、意外断行、重复段落、错误编号
2. 保留所有实质内容，不遗漏、不编造
3. 合并因分页/分栏导致的断裂段落
4. 保留原文中的关键术语、数字、日期等精确信息

### 知识完整性
1. 确保每个章节内容语义完整——不要把一个完整流程拆到两个节
2. 附带说明文字的表格/图片描述，与表格保持在同一节
3. FAQ 或问答对保持问题与回答在一起

## 原始文本
---
{raw_text}
---

直接输出整理后的 Markdown，不要包裹在代码块中："""


async def build_conversion_prompt(raw_text: str) -> str:
    from services.config_service import config_service
    cfg = await config_service.get("prompt_template", "CONVERSION_PROMPT")
    template = cfg["template"] if cfg else CONVERSION_PROMPT
    return template.format(raw_text=raw_text)
