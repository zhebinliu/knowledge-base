"""文档脱敏服务 — 转写完成后,把项目相关敏感信息替换成占位符。

策略(2026-05-08 用户拍板):
- **范围**:仅 project_id 非空的文档(KB 公共文档不动)
- **客户名 / 项目名变体**:用 Project.aliases JSON 字段(用户手动维护别名表)+
  Project.name / Project.customer 严格字面匹配。所有变体替换为客户名的拼音首字母大写
  (如「中国电信」→「ZGDX」)
- **金额**:LLM 一轮提取金额实体 → 替换为 `[金额已脱敏]`(准确度高于 regex,代价 +一次便宜模型调用)
- **原文保留**:转写后双字段:`Document.markdown_content_raw`(原)+ `markdown_content`(脱敏后)。
  后续生成默认用 markdown_content,raw 仅供追溯 / 调试

实现要点:
- 别名按长度倒序匹配,避免「电信」抢先把「中国电信」拆掉
- 拼音首字母:仅对纯中文计算;含英文 / 数字 / 标点的项目名直接保留(或用占位符)
- LLM 失败时不阻塞主流程,跳过金额脱敏 + log warning
"""
from __future__ import annotations

import json
import re
from typing import Iterable

import structlog

logger = structlog.get_logger()


def chinese_to_initials(name: str) -> str:
    """中文 → 拼音首字母大写。例:中国电信 → ZGDX,百迈客 → BMK。

    - 仅处理中文字符,英文 / 数字 / 符号原样保留(顺序保持)
    - 多音字默认取常用读音
    - 例外:返回空字符串时(全无中文)→ 直接返回原 name 作占位
    """
    if not name:
        return name
    try:
        from pypinyin import lazy_pinyin, Style
    except ImportError:
        logger.warning("pypinyin_not_installed")
        return name
    out = []
    for ch in name.strip():
        # 只对中文字符取拼音首字母,其他保留
        if "一" <= ch <= "鿿":
            try:
                py = lazy_pinyin(ch, style=Style.FIRST_LETTER)
                out.append((py[0] if py else ch).upper())
            except Exception:
                out.append(ch)
        elif ch.isalnum():
            out.append(ch.upper() if ch.isalpha() else ch)
        # 其他符号(空格、标点)忽略
    result = "".join(out)
    return result if result else name


def _build_alias_map(
    project_name: str | None,
    customer: str | None,
    aliases: list[str] | None,
) -> list[tuple[str, str]]:
    """生成 (old, new) 替换列表。按长度倒序,避免短词截断长词。

    输出:
    - 客户名 + 别名 → 客户拼音首字母(如 ZGDX)
    - 项目名 → [项目]
    """
    pairs: list[tuple[str, str]] = []
    customer_initials = chinese_to_initials(customer) if customer else None

    # 客户名 + aliases → 拼音首字母
    if customer:
        pairs.append((customer.strip(), customer_initials or "[客户]"))
    for a in (aliases or []):
        a = (a or "").strip()
        if not a:
            continue
        pairs.append((a, customer_initials or "[客户]"))

    # 项目名(独立占位,跟客户区分)— 因为项目名有时是「中国电信 AI 二期」,客户是「中国电信」
    # 项目名应该单独识别,占位「[项目]」
    if project_name:
        pname = project_name.strip()
        # 避免项目名 == 客户名重复占位(那种情况按客户处理就够了)
        if pname and (not customer or pname != customer):
            pairs.append((pname, "[项目]"))

    # 去重(同一字符串可能从 customer / aliases / name 多次进来)+ 长度倒序
    seen = set()
    unique = []
    for old, new in pairs:
        if old in seen:
            continue
        seen.add(old)
        unique.append((old, new))
    unique.sort(key=lambda x: -len(x[0]))
    return unique


def redact_names(md: str, alias_map: list[tuple[str, str]]) -> tuple[str, int]:
    """按 alias_map 做字面替换,返回 (new_md, n_replacements)。"""
    if not md or not alias_map:
        return md, 0
    n = 0
    for old, new in alias_map:
        if not old:
            continue
        cnt = md.count(old)
        if cnt > 0:
            md = md.replace(old, new)
            n += cnt
    return md, n


# ── LLM 金额提取 ───────────────────────────────────────────────────────────────

_AMOUNT_EXTRACT_SYSTEM = """你是一个数据脱敏助手。任务:扫描下面的文本,**只**识别其中所有涉及合同金额、报价金额、预算金额、回款金额等"商业金额"的具体表达,**逐字摘抄**这些表达,以便后续替换为占位符。

【识别范围】
- 含具体数字 + 货币单位的金额:如「¥350 万」「3500 万元」「人民币 100 万」「USD 50,000」
- 合同上下文里的金额表达:如「合同金额 350 万元」「项目预算 200 万」「回款 50 万」「报价 ¥80,000」
- 范围 / 阶段付款:「100-200 万」「分三期支付,各 50 万」

【不识别】
- 普通数字(如「3 个客户」「项目持续 6 个月」「2024 年」)
- 百分比 / 评分:「赢率 30%」「质量 4 分」
- 数据规模:「10 万条记录」「500 个文档」
- KPI 增长目标:「年增 30%」(虽含%,不是钱)

【输出格式】
严格 JSON 数组,每项是要被替换的金额字符串(逐字,跟原文一字不差):
```json
["¥350 万", "合同金额 200 万元", "USD 50,000", ...]
```
若文本里没有金额表达,输出 `[]`。
"""


def _strip_json_array(raw: str) -> list[str]:
    """从 LLM 输出里抠 JSON 数组。"""
    fence = re.search(r"```json\s*(\[[\s\S]*?\])\s*```", raw, re.IGNORECASE)
    if fence:
        try:
            data = json.loads(fence.group(1))
            return [s for s in data if isinstance(s, str) and s.strip()]
        except Exception:
            pass
    i, j = raw.rfind("["), raw.rfind("]")
    if 0 <= i < j:
        try:
            data = json.loads(raw[i:j + 1])
            return [s for s in data if isinstance(s, str) and s.strip()]
        except Exception:
            pass
    return []


async def extract_amounts_via_llm(text: str, *, max_chars: int = 80000) -> list[str]:
    """让便宜 LLM 列出文本中所有金额表达。失败返回 []。
    text 太长时截断 — 长尾文档的尾部不太可能藏金额;真要全文跑可以分块,但本期不做。
    """
    if not text:
        return []
    snippet = text[:max_chars] if len(text) > max_chars else text
    try:
        from services.model_router import model_router
        content, _ = await model_router.chat_with_routing(
            "doc_amount_extraction",
            [
                {"role": "system", "content": _AMOUNT_EXTRACT_SYSTEM},
                {"role": "user", "content": snippet},
            ],
            max_tokens=2000,
            timeout=120.0,
        )
        items = _strip_json_array(content or "")
        # 去重 + 按长度倒序(防止短词抢先匹配)
        seen, unique = set(), []
        for s in items:
            s = s.strip()
            if s and s not in seen:
                seen.add(s)
                unique.append(s)
        unique.sort(key=lambda x: -len(x))
        return unique
    except Exception as e:
        logger.warning("amount_extract_llm_failed", error=str(e)[:200])
        return []


def redact_amounts(md: str, amounts: Iterable[str]) -> tuple[str, int]:
    """按 LLM 给出的金额列表逐个 string replace。"""
    if not md:
        return md, 0
    n = 0
    placeholder = "[金额已脱敏]"
    for a in amounts:
        a = (a or "").strip()
        if not a:
            continue
        cnt = md.count(a)
        if cnt > 0:
            md = md.replace(a, placeholder)
            n += cnt
    return md, n


# ── 总入口 ─────────────────────────────────────────────────────────────────────

async def redact_markdown(
    md: str,
    *,
    project_name: str | None,
    customer: str | None,
    aliases: list[str] | None,
    redact_amounts_flag: bool = True,
) -> tuple[str, dict]:
    """对 markdown 做完整脱敏:名字替换 + LLM 金额提取替换。

    返回 (脱敏后 md, 统计 dict)。
    """
    stats = {"name_replacements": 0, "amount_replacements": 0, "amounts_found": 0}
    if not md:
        return md, stats

    # 1. 名字 / 别名 替换
    alias_map = _build_alias_map(project_name, customer, aliases)
    md, n_names = redact_names(md, alias_map)
    stats["name_replacements"] = n_names

    # 2. 金额提取 + 替换(LLM)
    if redact_amounts_flag:
        amounts = await extract_amounts_via_llm(md)
        stats["amounts_found"] = len(amounts)
        md, n_amts = redact_amounts(md, amounts)
        stats["amount_replacements"] = n_amts

    return md, stats
