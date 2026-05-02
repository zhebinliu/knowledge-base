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


# 6 维 rubric — 标准恒定,不要轻易改。每个维度有"判定标准 + 反例"。
# 注:timeliness(时效性)已被排除在挑战维度之外 — 项目刚交接 PM,大部分动作还没发生,
# 时效性判断噪音大、误判多;留给后续 review 阶段人工把关,不让 challenger 介入。
_RUBRIC_SPEC = """## 6 维质量挑战 Rubric (恒定标准)

### 1. specificity (具体性)
- 主语 / 对象 / 条件 / 时间 是否明确?
- ✅ 好:「陕西分公司 12/15 出现 2 次商机审批超时,单次平均等待 3.2 天」
- ❌ 差:「系统不稳定」/「流程效率低」/「整体表现良好」

### 2. evidence (证据)
- 每条事实陈述末尾是否有 [D1] [K2] [W3] 形式的引用 ID?
- 缺引用的句子要么改成「建议在 Phase 1 第一周补充访谈以确认」要么删除
- ❌ 严禁:「[访谈]」「[KB]」「[Brief]」这种泛化标签 — 必须用具体 ID

### 3. next_step (下一步行动)
- 每条结论是否配 Owner + deadline + 预期产出?
- ❌ 严禁:「加强沟通」「持续关注」「进一步研究」「及时跟进」

### 4. completeness (完整性)
- 用户上传的关键文档(SOW / 合同 / 交接单)的关键信息是否在报告里?
- 用户填的成功指标问卷答案是否被引用?
- 干系人图谱里的关键决策人是否在报告里出现?

### 5. consistency (一致性)
- 同一干系人 / 数字 / 日期 在不同章节是否一致?
- 总体 RAG 跟各维度子 RAG 是否矛盾?
- 同一风险在 M3/M7 是否描述一致?

### 6. jargon (黑话过滤)
- 是否含「赋能 / 抓手 / 闭环 / 链路 / 生态 / 打通 / 沉淀 / 触达 / 复盘 / 颗粒度」?
- 有就改简体白话(用具体动词替代,如「打通系统」→「把 ERP 客户主数据同步到 CRM」)

**注意**:不要再就「时效性 / timeliness / Deadline 早于今天 / 信息过期」给挑战意见 —
该维度已不在评判范围内,看到也忽略。
"""

CHALLENGER_SYSTEM = f"""你是 MBB 资深实施咨询合伙人,在审阅项目洞察报告。
你的职责:**挑刺**。这份报告会拿给项目组 / 客户高管看,任何模糊 / 缺数据 / 缺引用 / 黑话 / 自相矛盾,都会让我们丢面子。

按下面这套**固定 rubric** 找问题,标准不能让步,不能因为「整体不错」就放过细节问题。

{_RUBRIC_SPEC}

## 输出格式 — 用 Markdown(不要 JSON)

LLM 严格 JSON 输出常常出错。本系统改用 **Markdown 半结构化** 格式,
你只需要按下面的格式输出,不用关心引号 / 逗号 / 转义等 JSON 语法细节。

**完整示例 — 严格按这个结构输出:**

```
verdict: minor_issues

总结: 整体可读,有 2 处证据缺失需要补充,M7 风险表的下一步动作不到位。

## 问题清单

- 模块: M3_health_radar
  维度: evidence
  严重度: major
  问题: M3 质量维度 RAG=red 但没引用具体缺陷数据
  建议: 补充 [D1] 里的 UAT 缺陷计数,如 12/15 报告 8 项 P1

- 模块: M7_raid
  维度: next_step
  严重度: minor
  问题: 推广风险无具体责任人
  建议: 加 Owner = 实施 PM,Deadline = 2025-W18 启动会

- 模块: _global
  维度: jargon
  严重度: minor
  问题: M5 行业上下文出现「赋能」黑话
  建议: 改成「帮 5 家子公司打通客户主数据同步」
```

**输出规则**:
1. **第一行**:`verdict: <pass / minor_issues / major_issues 三选一>`
2. **第二行(可空一行)**:`总结: <一句话总结全文质量>`
3. **问题清单**:用 `## 问题清单` 标题,后面跟若干 issue 列表项
4. 每个 issue **必须 5 行,严格按以下顺序**:
   - `- 模块: <英文 module key,如 M3_health_radar 或 _global>`
   - `  维度: <specificity / evidence / next_step / completeness / consistency / jargon 六选一>`
   - `  严重度: <blocker / major / minor 三选一>`
   - `  问题: <一句话描述问题>`
   - `  建议: <一句话给出具体修改方向>`
5. issues 数量 0-12 条,贪多嚼不烂

## 判定 verdict 规则

- **pass**:0 个 blocker + 0 个 major + ≤ 2 minor → 报告可发布
- **minor_issues**:0 blocker + 0-2 major + 任意 minor → 修一下更好,但已可发布
- **major_issues**:任何 blocker 或 ≥ 3 major → 必须修才能发布,Runner 会重生成

## 重要原则

- **严禁编造事实** — 你只能基于报告内容找问题,不能假设报告外的内容是缺的
- **严禁吹毛求疵到无意义** — minor 用在「确实有改进余地」的地方,不是「这个标点不对」
- 如果报告整体已经很高质量,只输出第一二行(verdict + 总结),问题清单留空也行
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
    """解析挑战器的 Markdown 半结构化输出(函数名保留 _json 是历史遗留)。

    LLM 输出格式(参考 CHALLENGER_SYSTEM 里的示例):
      verdict: <pass/minor_issues/major_issues>
      总结: <一句话>
      ## 问题清单
      - 模块: M3_health_radar
        维度: evidence
        严重度: major
        问题: ...
        建议: ...

    Returns: (parsed_dict, raw_kept_on_failure)
      - 成功:(parsed, None)
      - LLM 完全空输出(网络 / 超时 / 配额异常):视为 pass 不阻塞流程
      - 极少见的格式异常:(parse_failed_dict, raw_text_for_debug)

    Markdown 容错性比 JSON 高,几乎不会失败 — LLM 只要照 example 写就行。
    """
    original = raw or ""

    # 边界:raw 完全空 — 标记原因供运维定位(常见:LLM 把所有 token 用在 think 上、
    # API edge function 异常、max_tokens 用尽推理未输出 — 不是真"通过")
    if not (raw or "").strip():
        logger.warning("challenger_raw_empty",
                       raw_len=len(original),
                       hint="LLM 返回空 content,可能是 max_tokens 在 think 里用尽 / API 异常 / 网络超时")
        return {
            "verdict": "parse_failed",
            "summary": "⚠ 挑战器返回空内容(可能 LLM 推理 token 在 <think> 块里用尽 / API 异常),建议查 celery 日志确认根因",
            "issues": [],
        }, original[:4000]

    # 剥推理模型 think 块
    raw_clean = re.sub(r'<think>[\s\S]*?</think>', '', raw, flags=re.IGNORECASE).strip()
    # 截断未闭合的 think
    if '<think>' in raw_clean.lower():
        idx = raw_clean.lower().find('<think>')
        raw_clean = raw_clean[:idx].strip()
    # think 剥光后空 → 用原文(可能 verdict 在 think 里)
    if not raw_clean:
        raw_clean = raw

    # 详细记录 raw 形态,便于诊断 LLM 行为模式
    logger.info("challenger_raw_received",
                raw_len=len(raw), clean_len=len(raw_clean),
                has_think_block='<think>' in raw.lower(),
                think_unclosed='<think>' in raw.lower() and '</think>' not in raw.lower(),
                raw_head=raw[:200],
                raw_tail=raw[-200:] if len(raw) > 200 else "")

    # ── verdict ─────────────────────────────
    verdict_m = re.search(
        r'verdict\s*[::]\s*(pass|minor_issues|major_issues)',
        raw_clean, re.IGNORECASE,
    )
    verdict = verdict_m.group(1).lower() if verdict_m else None

    # ── 总结 / summary ─────────────────────
    summary_m = re.search(
        r'(?:总结|summary)\s*[::]\s*(.+?)(?=\n\s*\n|\n##|\n\s*-\s*模块|\Z)',
        raw_clean, re.IGNORECASE | re.DOTALL,
    )
    summary = (summary_m.group(1).strip() if summary_m else "")[:300]

    # ── issues 列表 ─────────────────────────
    # 用 `- 模块:` 作为 issue 起点,split 出每段
    parts = re.split(r'\n\s*-\s*模块\s*[::]', raw_clean)
    issues = []
    for block in parts[1:]:               # 第 0 段不是 issue
        # 第一行是 module_key
        first_line = block.split('\n', 1)[0].strip()
        module_key = first_line[:60] or "_global"
        rest = block.split('\n', 1)[1] if '\n' in block else ''
        # 用 (?=...) 前瞻,抓到字段值直到下一个字段或下一个 issue
        next_field = r'(?=\n\s*(?:维度|严重度|问题|建议|-\s*模块|##)\s*[::]|\Z)'
        dim_m  = re.search(r'维度\s*[::]\s*([^\n]+)' + next_field,  rest, re.DOTALL)
        sev_m  = re.search(r'严重度\s*[::]\s*([^\n]+)' + next_field, rest, re.DOTALL)
        text_m = re.search(r'问题\s*[::]\s*(.+?)' + next_field,      rest, re.DOTALL)
        sugg_m = re.search(r'建议\s*[::]\s*(.+?)' + next_field,      rest, re.DOTALL)
        # 维度 / 严重度 归一化
        dim_raw = (dim_m.group(1).strip() if dim_m else "specificity").lower()
        valid_dims = {"specificity", "evidence", "next_step",
                      "completeness", "consistency", "jargon"}
        if dim_raw not in valid_dims:
            # 中文容错:维度 LLM 可能写中文
            dim_zh = {"具体性": "specificity", "证据": "evidence",
                      "下一步": "next_step", "完整性": "completeness",
                      "一致性": "consistency", "黑话": "jargon"}
            dim_raw = dim_zh.get(dim_raw.strip(), "specificity")
        # 即使 LLM 仍然把 timeliness / 时效性 写出来,挑战流水线也直接丢弃 — 该维度已下线
        if dim_raw in ("timeliness", "时效性") or "时效" in dim_raw:
            continue
        sev_raw = (sev_m.group(1).strip() if sev_m else "minor").lower()
        if sev_raw not in {"blocker", "major", "minor"}:
            sev_zh = {"严重": "major", "重大": "major", "次要": "minor", "轻微": "minor",
                      "阻塞": "blocker"}
            sev_raw = sev_zh.get(sev_raw, "minor")
        issues.append({
            "module_key": module_key,
            "dimension":  dim_raw[:30],
            "severity":   sev_raw[:20],
            "text":       (text_m.group(1).strip() if text_m else "")[:600],
            "suggestion": (sugg_m.group(1).strip() if sugg_m else "")[:600],
        })
        if len(issues) >= 12:
            break

    # ── 失败兜底 ─────────────────────────
    # 如果 verdict 抽不到,且 issues 也是空 → 视为完全解析失败
    if verdict is None and not issues:
        # 看看原文里有没有任何挑战相关关键词,有的话默认 minor_issues 兜底而不是 parse_failed
        has_signal = any(kw in raw_clean.lower() for kw in
                         ['问题', 'issue', '建议', 'suggest', '改进', '缺', 'missing'])
        if has_signal:
            # 有挑战意图但格式不对 → 当作 minor_issues 警告但不阻塞
            return {
                "verdict": "minor_issues",
                "summary": "挑战器输出格式不规范,详细意见见原始内容",
                "issues": [],
            }, None
        logger.warning("challenger_parse_failed",
                       reason="no_verdict_and_no_issues",
                       raw_head=raw_clean[:300])
        return {
            "verdict": "parse_failed",
            "summary": "⚠ 挑战器输出格式异常,本轮跳过审核(报告质量未确认)",
            "issues": [],
        }, original[:4000]

    return {
        "verdict":  verdict or "minor_issues",   # 有 issues 但没 verdict → 默认 minor
        "summary":  summary,
        "issues":   issues,
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


async def challenge_report(
    *,
    full_md: str,
    model: str | None = None,
    prev_critique: dict | None = None,
    module_keys: list[tuple[str, str]] | None = None,
) -> tuple[dict, str, str | None]:
    """对完整 markdown 报告做一轮挑战。

    Args:
        full_md: 当前轮(已重生成)的报告 markdown
        prev_critique: 上一轮的 critique 字典 — 见下方"复核机制"
        module_keys: 当前报告实际的 [(module_key, 中文标题)] 列表。
            **必传**,否则 LLM 会从报告章节标题里编英文 key(如 M1_scope),
            跟 runner 实际 module key (如 M1_outline_objective) 对不上,
            导致 modules_regenerated 永远为空,挑战循环白跑。

    Returns: (critique_dict, model_used, raw_on_failure)
    """
    # 控制 prompt 体量(大报告截断,保留头/中/尾各 1/3,确保上下文够看)
    MAX_REPORT_CHARS = 50000
    if len(full_md) > MAX_REPORT_CHARS:
        head = full_md[:MAX_REPORT_CHARS // 2]
        tail = full_md[-MAX_REPORT_CHARS // 2:]
        report_for_prompt = head + "\n\n…(中间约 " + str(len(full_md) - MAX_REPORT_CHARS) + " 字省略)…\n\n" + tail
    else:
        report_for_prompt = full_md

    # 上一轮的 issue 清单 — 让 LLM 有意识复核
    prev_issues_block = ""
    if prev_critique and prev_critique.get("issues"):
        lines = []
        for it in prev_critique["issues"][:20]:    # 最多列 20 条,避免 prompt 爆
            mk = it.get("module_key") or "?"
            dim = it.get("dimension") or "?"
            sev = it.get("severity") or "minor"
            txt = (it.get("text") or "").strip()[:200]
            lines.append(f"- 模块={mk} / 维度={dim} / 严重度={sev}: {txt}")
        prev_issues_block = f"""
[上一轮挑战发现的问题清单](Runner 已根据这些问题重生成相关章节,本轮请复核)

{chr(10).join(lines)}

**复核要求**:
1. **逐条复核上一轮的问题在当前报告里是否还存在**
2. 已经修复的:**不要再列**(默默放过即可)
3. 仍然存在或部分存在的:**继续列入本轮问题清单**(说明现在的具体问题)
4. 然后再补充本轮**新发现**的问题(不在上一轮清单里的)
5. 总结里可以提一下"上一轮 N 个问题中已修复 M 个"作为进度参考
"""

    # 当前报告的合法 module_key 清单 — 必须给 LLM,否则它会从中文标题里瞎编英文 key
    module_keys_block = ""
    if module_keys:
        keys_lines = [f"- `{k}`: {label}" for k, label in module_keys]
        module_keys_block = f"""
[本报告合法的 module_key 清单 — 你的 issue 输出只能从下面这个列表里选,**不要自己编**]

{chr(10).join(keys_lines)}
- `_global`: 跨模块 / 全局问题(无法定位单模块时用)

⚠ 严禁输出列表外的 key(如 M1_scope / M3_schedule 等简写),Runner 会因 key 对不上
而无法重生成对应章节,挑战循环就白跑了。
"""

    user_prompt = f"""请审阅以下项目洞察报告,按 system 给的 6 维 rubric 找问题。

按 system 里的 Markdown 格式输出(verdict 一行 + 总结 + 问题清单)。
不用 JSON,不用关心引号 / 逗号 / 转义等格式细节。

注:**不要**就「时效性 / Deadline 是否合理 / 信息是否过期」提任何挑战意见 —
该维度已被排除在挑战范围之外,看到也忽略。
{module_keys_block}{prev_issues_block}
[项目洞察报告]:

{report_for_prompt}
"""
    # 自动重试 1 次:LLM 偶发输出格式异常(non-strict JSON)→ 解析失败时再调用一次。
    # 第二次 prompt 末尾追加"上次输出无法解析"的反馈,提高重试成功率。
    MAX_RETRIES = 2
    last_raw_on_fail: str | None = None
    used_model: str = ""
    for attempt in range(MAX_RETRIES):
        cur_user_prompt = user_prompt
        if attempt > 0 and last_raw_on_fail:
            # 重试时把上次失败的输出作为反馈附在 prompt 末尾(几乎不会发生 — markdown 解析极宽容)
            cur_user_prompt += (
                f"\n\n⚠ **上次你的输出格式不规范**,以下是片段(前 800 字),"
                f"请严格按 system 的 Markdown 格式重新输出(verdict 一行 + 总结 + 问题清单):\n\n"
                f"```\n{last_raw_on_fail[:800]}\n```\n"
            )
        try:
            result, used_model = await model_router.chat_with_routing(
                "conversion_refine",                        # 复用 glm-5 (review/judging best_for)
                [
                    {"role": "system", "content": CHALLENGER_SYSTEM},
                    {"role": "user", "content": cur_user_prompt},
                ],
                max_tokens=8000,                            # 推理模型 think 块占用大,4000 容易跑光导致 content 空
                temperature=0.2 if attempt == 0 else 0.1,
                timeout=180.0,
                strip_think=False,        # 关键:推理模型 GLM-5 可能把 JSON 也写在 <think>
                                            # 块里,默认剥光会变成空字符串。这里拿原始内容,
                                            # _parse_critique_json 用 _balanced_json_block 自己抓 JSON
            )
            # 立即记录 LLM 返回的原始内容,定位"为什么空" — 是真没意见 / 推理跑光 / API 异常
            _r = result or ""
            logger.info("challenger_llm_returned",
                        attempt=attempt + 1, model=used_model,
                        len=len(_r),
                        is_empty=not _r.strip(),
                        has_think='<think>' in _r.lower(),
                        think_unclosed='<think>' in _r.lower() and '</think>' not in _r.lower(),
                        head=_r[:300], tail=_r[-200:] if len(_r) > 200 else "")
            critique, raw_on_fail = _parse_critique_json(result or "")
            if raw_on_fail is None:
                # 解析成功
                logger.info(
                    "challenger_round_done",
                    verdict=critique["verdict"],
                    issues_n=len(critique["issues"]),
                    model=used_model,
                    attempt=attempt + 1,
                )
                return critique, used_model, None
            # 解析失败 — 记下来准备重试
            last_raw_on_fail = raw_on_fail
            logger.warning(
                "challenger_parse_failed_retrying",
                attempt=attempt + 1, max_retries=MAX_RETRIES,
                model=used_model, raw_head=raw_on_fail[:200],
            )
        except Exception as e:
            logger.warning("challenger_call_exception", attempt=attempt + 1, err=str(e)[:160])
            if attempt == MAX_RETRIES - 1:
                # 最后一次还异常 → 走外层兜底
                return {
                    "verdict": "pass",
                    "summary": f"挑战器调用异常,跳过: {str(e)[:80]}",
                    "issues": [],
                }, "", None

    # 所有重试都解析失败 → 返回 parse_failed 状态
    logger.warning("challenger_all_retries_parse_failed", retries=MAX_RETRIES)
    return {
        "verdict": "parse_failed",
        "summary": f"挑战器输出 {MAX_RETRIES} 次都无法解析,跳过本轮审核",
        "issues": [],
    }, used_model, last_raw_on_fail


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
