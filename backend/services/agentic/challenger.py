"""Challenger Agent — 对生成好的 insight 报告做质量挑战。

跟单模块的 critic.py 不同:
- critic 看每个 module 单独打分(一次性,主要走 rubric)
- challenger 看整篇报告找问题,按固定 7 维 rubric 输出结构化 issues,
  Runner 拿到 issues 后按 module_key 回 executor 重生成相关模块,
  循环最多 N 轮(默认 3),直到 verdict='pass' 或者轮数用完。

标准必须**恒定** — system prompt 定死,不能让 LLM 自由发挥每次都换尺子。
"""
import json
import re
import structlog

from services.model_router import model_router

logger = structlog.get_logger()


# 7 维 rubric — 标准恒定,不要轻易改。每个维度有"判定标准 + 反例"。
_RUBRIC_SPEC = """## 7 维质量挑战 Rubric (恒定标准)

### 1. specificity (具体性)
- 主语 / 对象 / 条件 / 时间 是否明确?
- ✅ 好:「陕西分公司 12/15 出现 2 次商机审批超时,单次平均等待 3.2 天」
- ❌ 差:「系统不稳定」/「流程效率低」/「整体表现良好」

### 2. evidence (证据)
- 每条事实陈述末尾是否有 [D1] [K2] [W3] 形式的引用 ID?
- 缺引用的句子要么改成「建议在 Phase 1 第一周补充访谈以确认」要么删除
- ❌ 严禁:「[访谈]」「[KB]」「[Brief]」这种泛化标签 — 必须用具体 ID

### 3. timeliness (时效性)
- 结论是否还能影响项目结果?(避免事后诸葛亮)
- 风险 / 动作 是否有明确时间窗口?(本周 / 本月 / 季度内)

### 4. next_step (下一步行动)
- 每条结论是否配 Owner + deadline + 预期产出?
- ❌ 严禁:「加强沟通」「持续关注」「进一步研究」「及时跟进」

### 5. completeness (完整性)
- 用户上传的关键文档(SOW / 合同 / 交接单)的关键信息是否在报告里?
- 用户填的成功指标问卷答案是否被引用?
- 干系人图谱里的关键决策人是否在报告里出现?

### 6. consistency (一致性)
- 同一干系人 / 数字 / 日期 在不同章节是否一致?
- 总体 RAG 跟各维度子 RAG 是否矛盾?
- 同一风险在 M3/M7 是否描述一致?

### 7. jargon (黑话过滤)
- 是否含「赋能 / 抓手 / 闭环 / 链路 / 生态 / 打通 / 沉淀 / 触达 / 复盘 / 颗粒度」?
- 有就改简体白话(用具体动词替代,如「打通系统」→「把 ERP 客户主数据同步到 CRM」)
"""

CHALLENGER_SYSTEM = f"""你是 MBB 资深实施咨询合伙人,在审阅项目洞察报告。
你的职责:**挑刺**。这份报告会拿给客户高管看,任何模糊 / 缺数据 / 缺引用 / 黑话 / 自相矛盾,都会让我们丢面子。

按下面这套**固定 rubric** 找问题,标准不能让步,不能因为「整体不错」就放过细节问题。

{_RUBRIC_SPEC}

## 输出契约 (必须严格遵守 — 否则系统无法解析)

只输出**纯 JSON**(不要包 ```json 代码块,不要前后加任何说明文字)。

**严格规则**:
1. 所有 key 用 **双引号** `"key"`,不能用单引号 `'key'`
2. 所有 string value 用 **双引号** `"value"`,不能用单引号
3. value 里如果有引号要用 `\\"` 转义,不要混用
4. 不要在最后一个元素后加多余逗号
5. 不要写注释 (// 或 /* */),JSON 不支持
6. 没有 issues 时也要输出 `"issues": []` 而不是省略

合法示例:
```
{{
  "verdict": "minor_issues",
  "summary": "整体可读,有 2 处证据缺失",
  "issues": [
    {{
      "module_key": "M3_health_radar",
      "dimension":  "evidence",
      "severity":   "major",
      "text":       "M3 质量维度 RAG=red 但没引用具体缺陷数据",
      "suggestion": "补充 [D1] 里的 UAT 缺陷计数,如 12/15 报告 8 项 P1"
    }}
  ]
}}
```

字段定义:
- verdict: 必须是 "pass" / "minor_issues" / "major_issues" 三选一
- module_key: 模块 key (M1_exec_summary / M3_health_radar 等),全局问题用 "_global"
- dimension: "specificity" / "evidence" / "timeliness" / "next_step" / "completeness" / "consistency" / "jargon"
- severity: "blocker" / "major" / "minor"

## 判定 verdict

- **pass**:0 个 blocker + 0 个 major + ≤ 2 minor → 报告可发布
- **minor_issues**:0 blocker + 0-2 major + 任意 minor → 修一下更好,但已可发布
- **major_issues**:任何 blocker 或 ≥ 3 major → 必须修才能发布,Runner 会重生成

## 重要原则

- **严禁编造事实** — 你只能基于报告内容找问题,不能假设报告外的内容是缺的
- **严禁吹毛求疵到无意义** — minor 用在「确实有改进余地」的地方,不是「这个标点不对」
- **issues 数量上限 12 条** — 抓最痛的,贪多嚼不烂
- 如果报告整体已经很高质量,verdict='pass' + issues=[] + summary 一句赞美即可
"""


def _strip_code_fence(text: str) -> str:
    """LLM 偶尔无视 contract 包 ```json,这里强行剥掉。"""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def _balanced_json_block(text: str) -> str | None:
    """从 text 里抓**最长的**括号平衡 {} 块,handle 嵌套。"""
    candidates: list[str] = []
    stack = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == '{':
            if stack == 0:
                start = i
            stack += 1
        elif ch == '}':
            if stack > 0:
                stack -= 1
                if stack == 0 and start >= 0:
                    candidates.append(text[start:i + 1])
                    start = -1
    if not candidates:
        return None
    return max(candidates, key=len)        # 选最长的 (最完整的)


def _clean_jsonish(text: str) -> str:
    """LLM 输出里常见的"非标准 JSON"字符做归一化:
    - 移除 // 行注释 / /* ... */ 块注释
    - 移除尾随逗号 (`, ]` / `, }`)
    - 移除 Unicode BOM
    """
    # 移除 BOM
    text = text.lstrip('﻿')
    # 移除 /* ... */ 块注释
    text = re.sub(r'/\*[\s\S]*?\*/', '', text)
    # 移除 // 行注释 (但要避开 url 里的 //)
    text = re.sub(r'(?<![:\w])//[^\n]*', '', text)
    # 移除尾随逗号
    text = re.sub(r',(\s*[\]\}])', r'\1', text)
    return text


def _parse_critique_json(raw: str) -> tuple[dict, str | None]:
    """容错解析(多重兜底)。

    Returns: (parsed_dict, raw_kept_on_failure)
      - 成功:(parsed, None)
      - 失败:(parse_failed_dict, raw_text_for_debug)

    解析顺序:
    1. 严格 json.loads
    2. _clean_jsonish 后 json.loads (去注释 / 尾逗号)
    3. ast.literal_eval (单引号 / True/False/None)
    4. 正则替换 '...' → "..." 后 json.loads
    """
    import ast
    original = raw
    raw = _strip_code_fence(raw)
    # 抓首个 {} 平衡块(handle 嵌套,选最长)
    if not raw.startswith("{"):
        block = _balanced_json_block(raw)
        if block:
            raw = block

    data = None
    parse_err = None

    # Tier 1: 严格 JSON
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        parse_err = e

    # Tier 2: 清掉注释 / 尾逗号 后再 JSON
    if data is None:
        try:
            cleaned = _clean_jsonish(raw)
            data = json.loads(cleaned)
            logger.info("challenger_parsed_after_cleanup", raw_head=raw[:80])
        except json.JSONDecodeError:
            pass

    # Tier 3: Python literal (单引号 / True/False/None)
    if data is None:
        try:
            d = ast.literal_eval(raw)
            if isinstance(d, dict):
                data = d
                logger.info("challenger_parsed_via_ast", raw_head=raw[:80])
        except (SyntaxError, ValueError):
            pass

    # Tier 4: 正则替换单引号 → 双引号 后再 JSON
    if data is None:
        try:
            tmp = re.sub(r"(?<=[\{,\s])'([^']+)'(\s*:)", r'"\1"\2', raw)
            tmp = re.sub(r":\s*'([^']*)'(\s*[,\}])", r': "\1"\2', tmp)
            tmp = _clean_jsonish(tmp)
            data = json.loads(tmp)
            logger.info("challenger_parsed_via_regex_quotes", raw_head=raw[:80])
        except Exception:
            pass

    if data is None:
        logger.warning("challenger_parse_failed",
                       err=str(parse_err)[:120] if parse_err else "all_tiers_failed",
                       raw_head=raw[:300])
        # 把原始 LLM 输出返回给 caller(persist 到 DB,前端展示供 debug)
        return {
            "verdict": "parse_failed",
            "summary": f"⚠ 挑战器输出无法解析,本轮跳过审核(报告质量未确认):{str(parse_err)[:80] if parse_err else 'unknown parse error'}",
            "issues": [],
        }, original[:4000]

    # 标准化
    verdict = data.get("verdict", "pass")
    if verdict not in ("pass", "minor_issues", "major_issues", "parse_failed"):
        verdict = "pass"
    issues = data.get("issues") or []
    norm_issues = []
    for it in issues[:12]:                # 截断至 12 条
        if not isinstance(it, dict):
            continue
        norm_issues.append({
            "module_key": str(it.get("module_key") or "_global")[:60],
            "dimension":  str(it.get("dimension")  or "specificity")[:30],
            "severity":   str(it.get("severity")   or "minor")[:20],
            "text":       str(it.get("text") or "")[:600],
            "suggestion": str(it.get("suggestion") or "")[:600],
        })
    return {
        "verdict":  verdict,
        "summary": str(data.get("summary") or "")[:300],
        "issues":  norm_issues,
    }, None


def affected_modules(critique: dict) -> list[str]:
    """从 critique 里提取需要重生成的 module_keys (按 severity 过滤)。

    blocker / major → 必须重生成
    minor → 不重生成 (只在最终报告里展示挑战意见)

    返回去重后的列表,排除 '_global' (全局意见无法定位单模块)。
    """
    keys: set[str] = set()
    for it in critique.get("issues") or []:
        if it.get("severity") not in ("blocker", "major"):
            continue
        mk = it.get("module_key")
        if mk and mk != "_global":
            keys.add(mk)
    return sorted(keys)


def should_continue(critique: dict, round_idx: int, max_rounds: int) -> bool:
    """是否继续下一轮挑战。"""
    if round_idx + 1 >= max_rounds:
        return False
    verdict = critique.get("verdict")
    if verdict == "pass":
        return False
    # parse_failed:挑战器自己挂了 — 不继续 retry (避免无限挂),
    # 但前端会用 verdict='parse_failed' 显示醒目的"未确认"状态,不当 pass
    if verdict == "parse_failed":
        return False
    # major_issues 或 minor_issues 都进下一轮
    # 但若没有 blocker / major issues 也提前收(没东西改)
    if not affected_modules(critique):
        return False
    return True


async def challenge_report(*, full_md: str, model: str | None = None) -> tuple[dict, str, str | None]:
    """对完整 markdown 报告做一轮挑战。

    Returns: (critique_dict, model_used, raw_on_failure)
      - raw_on_failure:解析失败时携带前 4000 字 LLM 原始输出供 debug;成功为 None
    """
    # 控制 prompt 体量(大报告截断,保留头/中/尾各 1/3,确保上下文够看)
    MAX_REPORT_CHARS = 50000
    if len(full_md) > MAX_REPORT_CHARS:
        head = full_md[:MAX_REPORT_CHARS // 2]
        tail = full_md[-MAX_REPORT_CHARS // 2:]
        report_for_prompt = head + "\n\n…(中间约 " + str(len(full_md) - MAX_REPORT_CHARS) + " 字省略)…\n\n" + tail
    else:
        report_for_prompt = full_md

    user_prompt = f"""请审阅以下项目洞察报告,按 system 给的 7 维 rubric 找问题。

⚠ 严禁 输出非 JSON 内容(包括开头 / 结尾的中文说明 / markdown 代码围栏)。
⚠ 第一个字符必须是 `{{`,最后一个字符必须是 `}}`。
⚠ 所有 key / string value 必须用**双引号** "key" / "value",不能用单引号。

[项目洞察报告]:

{report_for_prompt}
"""
    try:
        result, used_model = await model_router.chat_with_routing(
            "conversion_refine",                        # 复用 glm-5 (review/judging best_for)
            [
                {"role": "system", "content": CHALLENGER_SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=4000,
            temperature=0.2,
            timeout=180.0,
        )
        critique, raw_on_fail = _parse_critique_json(result or "")
        logger.info(
            "challenger_round_done",
            verdict=critique["verdict"],
            issues_n=len(critique["issues"]),
            model=used_model,
            parse_failed=raw_on_fail is not None,
        )
        return critique, used_model, raw_on_fail
    except Exception as e:
        logger.warning("challenger_failed", err=str(e)[:160])
        return {
            "verdict": "pass",
            "summary": f"挑战器调用失败,跳过: {str(e)[:80]}",
            "issues": [],
        }, "", None


REGEN_SYSTEM_SUFFIX = """

## 重要修订指令

挑战者已经对你上轮的输出指出了具体问题,按下面意见**针对性修订**本模块。
- 保留对的部分,只改有问题的地方
- 不要重新发挥,不要换主题,不要改写无问题的句子
- 严守原模块的 rubric 和引用 ID 规则
"""


def build_regen_user_suffix(module_key: str, critique: dict) -> str:
    """给某个模块的重新生成 prompt 末尾追加挑战意见。

    强化版:
    - 用 ★★★ 醒目分隔,LLM 不会当成普通文本忽略
    - 把意见放在末尾(LLM 对 prompt 末尾内容更敏感)
    - 同时强调"逐条解决+保留正确内容"的双重约束
    """
    module_issues = [
        it for it in (critique.get("issues") or [])
        if it.get("module_key") == module_key
    ]
    if not module_issues:
        return ""

    # 按 severity 排序,blocker 优先暴露
    sev_rank = {"blocker": 0, "major": 1, "minor": 2}
    module_issues.sort(key=lambda x: sev_rank.get(x.get("severity"), 9))

    lines = [
        "",
        "━" * 50,
        "★★★ 修订指令(必须执行)★★★",
        "",
        "你上轮的本模块输出被挑战者指出以下问题。请**针对性修订**:",
        "- 保留正确的句子原文,**只**改有问题的地方",
        "- 不要重新发挥/换主题/重写整段",
        "- 仍严守 system prompt 的 rubric + 引用 ID 规则",
        "- 完成所有 blocker / major 级别问题(列在前面),minor 视情况修",
        "",
        f"[挑战者上轮意见,共 {len(module_issues)} 条]:",
    ]
    for i, it in enumerate(module_issues, 1):
        sev_tag = {"blocker": "🚫 阻断", "major": "⚠️ 严重", "minor": "💡 优化"}.get(it.get("severity"), "")
        lines.append(f"{i}. {sev_tag} [{it.get('dimension')}] {it.get('text')}")
        if it.get("suggestion"):
            lines.append(f"   → 改写建议:{it.get('suggestion')}")
    lines.append("")
    lines.append("现在请输出修订版本:")
    lines.append("━" * 50)
    return "\n".join(lines)
