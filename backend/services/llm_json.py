"""LLM 输出 JSON 的健壮解析 —— 全后端共用一处,别再各写一份。

LLM 常产出"非标准 JSON":代码围栏、前后废话、行/块注释、**尾随逗号**、BOM、
**推理模型的 `<think>` 思考块**、以及 **被 max_tokens 截断的半截 JSON**。标准
`json.loads` 直接抛。会议纪要曾因 minimax 输出尾随逗号 / 截断 → 解析失败 → 存了空纪要。

`loads_lenient(text, default)` 依次尝试:
  1. 剥 `<think>` 思考块(推理模型把思考写进 content,尤其 MiniMax-M2.5)
  2. 剥代码围栏
  3. 原文 / 清洗后(去注释+尾随逗号)直接 `json.loads`
  4. 最长平衡 `{...}` 块
  5. **截断修复**:半截 JSON 按括号栈补齐 + 丢掉最后一个残缺元素(保住已完整的部分)
全失败才返回 default。幂等、无第三方依赖。

注:历史上 challenger.py / smart_advice.py 各写了一份类似逻辑,已于 2026-06 收敛到本文件。
2026-07-27 再收敛 `<think>` 剥离(原先散落在 model_router / converter_agent / challenger_agent
各处)与截断修复到此。
"""
import json
import re
from typing import Any


# 推理模型输出的 <think>...</think> 思考块(跨行、大小写不敏感)
_THINK_RE = re.compile(r"<think>[\s\S]*?</think>", re.IGNORECASE)


def strip_think(text: str) -> str:
    """去除推理模型的 `<think>...</think>` 思考块。

    - 完整闭合块:整段删。
    - 仅有 `<think>` 无 `</think>`(被 max_tokens 截断在思考里):删掉 `<think>` 及其后全部
      内容(此时模型还没吐出真正答案,残留的只是半截思考,保留反而污染解析)。

    这与 model_router.chat(strip_think=True) 的默认剥离同源;放这里让**解析层**也自带
    一层防护 —— 有些调用方故意 strip_think=False 拿原始内容自己解析(如 challenger),
    或输出经多次转手,不能假设上游一定剥过。
    """
    if not text:
        return text or ""
    cleaned = _THINK_RE.sub("", text)
    idx = cleaned.lower().find("<think>")
    if idx != -1:
        cleaned = cleaned[:idx]
    return cleaned.strip()


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


def repair_truncated_json(text: str) -> Any:
    """修复被截断的 JSON(finish_reason=length / 半截数组或对象)。

    思路:从第一个 `{`/`[` 起扫描,按括号栈定位「最后一个完整值边界」(逗号或闭括号
    之后),丢掉后面残缺的半个元素,再按栈补齐缺的 `]`/`}`(以及未闭合的字符串引号)。
    解析成功返回对象/数组,否则 None。字符串内的括号/逗号不计入(带转义处理)。
    """
    if not text:
        return None
    m = re.search(r"[\{\[]", text)
    if not m:
        return None
    s = text[m.start():]

    in_str = esc = False
    last_boundary = 0  # 最后一个「逗号 / 闭括号」之后的位置 = 一个完整元素的右边界
    for i, ch in enumerate(s):
        if esc:
            esc = False
            continue
        if ch == "\\":
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch in "}]" or ch == ",":
            last_boundary = i + 1

    core = s[:last_boundary] if last_boundary else s
    core = re.sub(r",\s*$", "", core)  # 去尾随逗号

    # 在 core 上重算未闭合的括号栈 + 是否停在字符串里
    stack: list[str] = []
    in_str = esc = False
    for ch in core:
        if esc:
            esc = False
            continue
        if ch == "\\":
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch in "{[":
            stack.append(ch)
        elif ch in "}]":
            if stack:
                stack.pop()

    closers = {"{": "}", "[": "]"}
    tail = ('"' if in_str else "") + "".join(closers[c] for c in reversed(stack))
    for cand in (core + tail, core):
        try:
            return json.loads(cand)
        except (json.JSONDecodeError, TypeError):
            continue
    return None


def loads_lenient(text: str, default: Any = None) -> Any:
    """健壮解析 LLM JSON。多级兜底,全失败返回 default。"""
    if not text:
        return default
    text = strip_think(text)          # 先剥推理模型思考块(可能含大量干扰 {} )
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
    # 最后兜底:截断修复(半截 JSON 保住已完整部分)。仅在上面全失败时才走,
    # 不影响正常完整 JSON 的解析结果。
    repaired = repair_truncated_json(clean_jsonish(stripped))
    if repaired is not None:
        return repaired
    return default
