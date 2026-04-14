CONVERSION_PROMPT = """你是一个文档格式整理专家。我会给你一段从文档中提取的原始文本，
请将其整理为结构清晰的 Markdown 格式。

要求：
1. 识别并添加合适的标题层级（#, ##, ###）
2. 将表格数据整理为 Markdown 表格
3. 将列表项整理为有序/无序列表
4. 保留所有实质内容，不要遗漏
5. 修复 OCR 或提取导致的明显错误（如乱码、断行、重复）
6. 不要添加原文中没有的内容

原始文本：
---
{raw_text}
---

请输出整理后的 Markdown："""


def build_conversion_prompt(raw_text: str) -> str:
    return CONVERSION_PROMPT.format(raw_text=raw_text)
