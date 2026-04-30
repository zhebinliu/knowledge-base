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

只输出**纯 JSON**(不要包 ```json 代码块,不要前后加任何说明文字),格式:

```
{{
  "verdict": "pass" | "minor_issues" | "major_issues",
  "summary": "本轮整体评价,一句话(<= 80 字)",
  "issues": [
    {{
      "module_key": "M3_health_radar",       // 如果是跨模块全局问题用 "_global"
      "dimension":  "specificity" | "evidence" | "timeliness" | "next_step" | "completeness" | "consistency" | "jargon",
      "severity":   "blocker" | "major" | "minor",
      "text":       "具体指出哪句话/哪段有问题,引用原文片段",
      "suggestion": "怎么改 — 给出可操作的具体改写或补充建议"
    }}
  ]
}}
```

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


def _parse_critique_json(raw: str) -> dict:
    """容错解析:剥 code fence + 找首个 {{...}} 块 + 标准化字段。"""
    raw = _strip_code_fence(raw)
    # 兜底:从文本里抓首个 {} 平衡块
    if not raw.startswith("{"):
        m = re.search(r'\{[\s\S]*\}', raw)
        if m:
            raw = m.group(0)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning("challenger_parse_failed", err=str(e)[:120], raw_head=raw[:200])
        # 解析失败 → 当成 pass 收(不阻断流程,但 log warn)
        return {"verdict": "pass", "summary": f"挑战器输出无法解析: {str(e)[:80]}", "issues": []}

    # 标准化
    verdict = data.get("verdict", "pass")
    if verdict not in ("pass", "minor_issues", "major_issues"):
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
    }


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
    # major_issues 或 minor_issues 都进下一轮
    # 但若没有 blocker / major issues 也提前收(没东西改)
    if not affected_modules(critique):
        return False
    return True


async def challenge_report(*, full_md: str, model: str | None = None) -> tuple[dict, str]:
    """对完整 markdown 报告做一轮挑战,返回 (critique_dict, model_used)。

    LLM 失败时返回 verdict='pass' 占位结果,不抛异常,让循环优雅退出。
    """
    # 控制 prompt 体量(大报告截断,保留头/中/尾各 1/3,确保上下文够看)
    MAX_REPORT_CHARS = 50000
    if len(full_md) > MAX_REPORT_CHARS:
        head = full_md[:MAX_REPORT_CHARS // 2]
        tail = full_md[-MAX_REPORT_CHARS // 2:]
        report_for_prompt = head + "\n\n…(中间约 " + str(len(full_md) - MAX_REPORT_CHARS) + " 字省略)…\n\n" + tail
    else:
        report_for_prompt = full_md

    user_prompt = f"""请审阅以下项目洞察报告,按 system 给的 7 维 rubric 找问题,严格按 JSON 格式输出。

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
        critique = _parse_critique_json(result or "")
        logger.info(
            "challenger_round_done",
            verdict=critique["verdict"],
            issues_n=len(critique["issues"]),
            model=used_model,
        )
        return critique, used_model
    except Exception as e:
        logger.warning("challenger_failed", err=str(e)[:160])
        return {
            "verdict": "pass",
            "summary": f"挑战器调用失败,跳过: {str(e)[:80]}",
            "issues": [],
        }, ""


REGEN_SYSTEM_SUFFIX = """

## 重要修订指令

挑战者已经对你上轮的输出指出了具体问题,按下面意见**针对性修订**本模块。
- 保留对的部分,只改有问题的地方
- 不要重新发挥,不要换主题,不要改写无问题的句子
- 严守原模块的 rubric 和引用 ID 规则
"""


def build_regen_user_suffix(module_key: str, critique: dict) -> str:
    """给某个模块的重新生成 prompt 末尾追加挑战意见。"""
    module_issues = [
        it for it in (critique.get("issues") or [])
        if it.get("module_key") == module_key
    ]
    if not module_issues:
        return ""
    lines = [
        "\n\n[挑战者上轮意见 — 必须解决]:",
    ]
    for it in module_issues:
        sev_tag = {"blocker": "🚫 阻断", "major": "⚠️ 严重", "minor": "💡 优化"}.get(it.get("severity"), "")
        lines.append(f"- {sev_tag} [{it.get('dimension')}] {it.get('text')}")
        if it.get("suggestion"):
            lines.append(f"  → 改写建议:{it.get('suggestion')}")
    return "\n".join(lines)
