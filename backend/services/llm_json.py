"""LLM 输出 JSON 的健壮解析 —— 全后端共用一处,别再各写一份。

LLM 常产出"非标准 JSON":代码围栏、前后废话、行/块注释、**尾随逗号**、BOM。标准
`json.loads` 直接抛。会议纪要曾因 minimax 输出尾随逗号 → 解析失败 → 存了空纪要(用户撞到)。

`loads_lenient(text, default)`:依次尝试 原文 / 清洗后(去注释+尾随逗号)/ 各自的最长平衡
`{...}` 块,全失败才返回 default。幂等、无第三方依赖。

注:历史上 challenger.py(_clean_jsonish/_balanced_json_block)、smart_advice.py
(_parse_json_loose)各写了一份类似逻辑,后续可逐步收敛到这里复用。
"""
import json
import re
from typing import Any


def strip_code_fence(text: str) -> str:
    """剥 ```json ... ``` 围栏,留纯 JSON。"""
    s = text.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
        s = s.rstrip()
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()


def clean_jsonish(text: str) -> str:
    """归一化 LLM 常见的非标准 JSON 字符:BOM / 注释 / 尾随逗号。"""
    text = text.lstrip("﻿")
    text = re.sub(r"/\*[\s\S]*?\*/", "", text)          # 块注释
    text = re.sub(r"(?<![:\w])//[^\n]*", "", text)       # 行注释(避开 url 里的 //)
    text = re.sub(r",(\s*[\]\}])", r"\1", text)          # 尾随逗号:`,]` / `,}`
    return text


def balanced_json_block(text: str) -> str | None:
    """抓 text 里**最长的**括号平衡 {} 块(handle 嵌套 + 前后废话)。"""
    candidates: list[str] = []
    stack = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == "{":
            if stack == 0:
                start = i
            stack += 1
        elif ch == "}":
            if stack > 0:
                stack -= 1
                if stack == 0 and start >= 0:
                    candidates.append(text[start:i + 1])
                    start = -1
    return max(candidates, key=len) if candidates else None


def loads_lenient(text: str, default: Any = None) -> Any:
    """健壮解析 LLM JSON。多级兜底,全失败返回 default。"""
    if not text:
        return default
    stripped = strip_code_fence(text)
    for candidate in (stripped, clean_jsonish(stripped)):
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, TypeError):
            pass
        block = balanced_json_block(candidate)
        if block:
            try:
                return json.loads(block)
            except json.JSONDecodeError:
                pass
    return default
