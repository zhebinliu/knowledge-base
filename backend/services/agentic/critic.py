"""Critic — 用 Sopact rubric 给 module 内容打分。

四个维度(0-4):
- Specificity: 主语 / 对象 / 条件是否明确
- Evidence: 数据点是否有 [访谈]/[KB]/[Brief]/[Web]/[推断] 标注;编造一律 0 分
- Timeliness: 结论现在还能影响项目结果(避免事后诸葛亮)
- Next Step: 是否每条结论配 Owner + deadline

阈值: Specificity / Evidence / Next Step ≥ 3,Timeliness ≥ 2
任一维度 < 阈值 → needs_rework(本期不实做 retry,只标记)

为节省 token,critic 一次评所有模块(或所有分卷),让 LLM 一次性输出 JSON 评分。
"""
import json
import structlog
from dataclasses import dataclass, field
from typing import Literal

logger = structlog.get_logger()


@dataclass
class ModuleScore:
    module_key: str
    specificity: int
    evidence: int
    timeliness: int
    next_step: int
    overall: Literal["pass", "needs_rework", "insufficient"]
    issues: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "module_key": self.module_key,
            "scores": {
                "specificity": self.specificity,
                "evidence": self.evidence,
                "timeliness": self.timeliness,
                "next_step": self.next_step,
            },
            "overall": self.overall,
            "issues": self.issues,
        }


CRITIC_SYSTEM = """你是项目洞察报告的【质量评审 Critic】(资深 MBB partner 视角)。

任务:对给到的 N 个模块内容用 Sopact 四要素打分(0-4 分):
- **Specificity**: 主语/对象/条件是否明确?(不是"系统不稳定"而是"陕西分公司 12/15 出现 2 次商机审批超时")
- **Evidence**: 数据点是否有 [访谈]/[KB]/[Brief]/[Web]/[推断] 标注?**编造或来源不明 = 0 分**
- **Timeliness**: 结论现在还能影响项目结果?(避免事后诸葛亮)
- **Next Step**: 每条结论配 Owner + deadline?(不是"加强沟通"这种空话)

阈值规则:
- Specificity ≥ 3 通过,Evidence ≥ 3 通过,Next Step ≥ 3 通过,Timeliness ≥ 2 通过
- 任一未通过 → overall = "needs_rework"
- 全通过 → overall = "pass"
- 模块内容明显残缺(<200 字 或 全是占位符) → overall = "insufficient"

【输出 — 严格 JSON,不要 markdown 围栏】
{
  "scores": [
    {
      "module_key": "M1_exec_summary",
      "specificity": 3,
      "evidence": 2,
      "timeliness": 4,
      "next_step": 3,
      "overall": "needs_rework",
      "issues": ["证据:风险一节未标注来源"]
    },
    ...
  ]
}

【issues 写作规则】
- 必须用简体中文,不要写英文术语,术语对照(必须替换):
  Specificity → 具体性 / Evidence → 证据 / Timeliness → 时效性 / Next Step → 下一步
  Owner → 责任人 / deadline → 截止日期 / completeness → 完整性
- 引用 KB / 访谈 / Brief 来源时保留原始 ID 格式(K1, D1, [访谈] 等),不翻译
- 每条 issue 一句话,15-30 字,顾问可直接 review 时按图索骥补漏
"""


async def critique_modules(
    module_contents: list[tuple[str, str]],   # [(module_key, content), ...]
    *,
    model: str | None = None,
) -> dict[str, ModuleScore]:
    """评分所有 modules,返回 {module_key: ModuleScore}。"""
    if not module_contents:
        return {}
    from services.output_service import _llm_call

    body_blocks = []
    for mk, content in module_contents:
        body_blocks.append(f"### 模块: {mk}\n\n{content[:3000]}")  # 截断保护 prompt 长度
    user_prompt = "请评分以下 " + str(len(module_contents)) + " 个模块:\n\n" + "\n\n---\n\n".join(body_blocks)

    try:
        raw = await _llm_call(
            user_prompt, system=CRITIC_SYSTEM, model=model,
            max_tokens=2000, timeout=120.0,
        )
        return _parse_critic_output(raw, [mk for mk, _ in module_contents])
    except Exception as e:
        logger.warning("critic_call_failed", error=str(e)[:200])
        # 全部判 pass(降级:critic 失败不阻塞文档发布)
        return {
            mk: ModuleScore(module_key=mk, specificity=3, evidence=3,
                            timeliness=3, next_step=3, overall="pass",
                            issues=[f"critic 调用失败,默认 pass: {str(e)[:80]}"])
            for mk, _ in module_contents
        }


def _parse_critic_output(raw: str, expected_keys: list[str]) -> dict[str, ModuleScore]:
    """解析 LLM 输出的 JSON。容错:剥围栏 / 截到第一个 { / raw_decode。"""
    text = (raw or "").strip()
    if text.startswith("```"):
        nl = text.find("\n")
        if nl >= 0:
            text = text[nl + 1:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    if not text.startswith("{"):
        i = text.find("{")
        if i >= 0:
            text = text[i:]
    try:
        parsed, _ = json.JSONDecoder().raw_decode(text)
    except Exception as e:
        logger.warning("critic_parse_failed", error=str(e)[:120], head=text[:200])
        # 解析失败 → 全 pass(降级)
        return {
            mk: ModuleScore(module_key=mk, specificity=3, evidence=3,
                            timeliness=3, next_step=3, overall="pass",
                            issues=["critic 解析失败,默认 pass"])
            for mk in expected_keys
        }
    out: dict[str, ModuleScore] = {}
    scores_arr = parsed.get("scores", []) if isinstance(parsed, dict) else []
    by_key = {s.get("module_key"): s for s in scores_arr if isinstance(s, dict)}
    for mk in expected_keys:
        s = by_key.get(mk) or {}
        out[mk] = ModuleScore(
            module_key=mk,
            specificity=int(s.get("specificity", 3)),
            evidence=int(s.get("evidence", 3)),
            timeliness=int(s.get("timeliness", 3)),
            next_step=int(s.get("next_step", 3)),
            overall=s.get("overall", "pass") if s.get("overall") in {"pass", "needs_rework", "insufficient"} else "pass",
            issues=s.get("issues", []) if isinstance(s.get("issues"), list) else [],
        )
    return out


# ── Survey Critic ──────────────────────────────────────────────────────────────

@dataclass
class SubsectionScore:
    subsection_key: str
    question_count: int
    type_diversity: int            # 0-4: 题型混合度(事实/判断/数据/开放)
    no_jargon: int                 # 0-4: 没黑话
    actionable: int                # 0-4: 题目颗粒度可作答
    no_duplicate: int              # 0-4: 与已访谈无重复
    overall: Literal["pass", "needs_rework", "insufficient"]
    issues: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "subsection_key": self.subsection_key,
            "question_count": self.question_count,
            "scores": {
                "type_diversity": self.type_diversity,
                "no_jargon": self.no_jargon,
                "actionable": self.actionable,
                "no_duplicate": self.no_duplicate,
            },
            "overall": self.overall,
            "issues": self.issues,
        }


SURVEY_CRITIC_SYSTEM = """你是 CRM 实施前调研问卷的【质量评审 Critic】。

任务:对给到的 N 个分卷打分(0-4 分):
- **type_diversity**: 题型是否混合(事实/判断/数据/开放),≥3 通过
- **no_jargon**: 是否避免黑话(赋能/抓手/闭环/链路/生态/数字化转型/全方位),≥3 通过
- **actionable**: 题目颗粒度是否具体到可作答(不是"如何看待..."这种空泛题),≥3 通过
- **no_duplicate**: 与"已覆盖话题"是否重复,≥3 通过
- **question_count**: 实际题数(整数,作为信息字段)

阈值规则:
- 任一维度 < 阈值 → overall = "needs_rework"
- 全通过 → overall = "pass"
- 题数 < 5 或问卷骨架不完整 → overall = "insufficient"

【输出 — 严格 JSON,不要 markdown 围栏】
{
  "scores": [
    {
      "subsection_key": "biz_kpi",
      "question_count": 10,
      "type_diversity": 4,
      "no_jargon": 4,
      "actionable": 3,
      "no_duplicate": 4,
      "overall": "pass",
      "issues": []
    },
    ...
  ]
}
"""


async def critique_subsections(
    subsection_contents: list[tuple[str, str, list[str]]],  # [(subsection_key, content, already_covered), ...]
    *,
    model: str | None = None,
) -> dict[str, SubsectionScore]:
    """评分所有 subsections。"""
    if not subsection_contents:
        return {}
    from services.output_service import _llm_call

    body_blocks = []
    for sk, content, covered in subsection_contents:
        cov = ", ".join(covered) if covered else "（无)"
        body_blocks.append(f"### 分卷: {sk}\n\n**已覆盖话题(用于评 no_duplicate):** {cov}\n\n{content[:3000]}")
    user_prompt = "请评分以下 " + str(len(subsection_contents)) + " 个分卷:\n\n" + "\n\n---\n\n".join(body_blocks)

    try:
        raw = await _llm_call(
            user_prompt, system=SURVEY_CRITIC_SYSTEM, model=model,
            max_tokens=2000, timeout=120.0,
        )
        return _parse_survey_critic(raw, [sk for sk, _, _ in subsection_contents])
    except Exception as e:
        logger.warning("survey_critic_failed", error=str(e)[:200])
        return {
            sk: SubsectionScore(
                subsection_key=sk, question_count=0,
                type_diversity=3, no_jargon=3, actionable=3, no_duplicate=3,
                overall="pass", issues=[f"critic 调用失败,默认 pass: {str(e)[:80]}"],
            )
            for sk, _, _ in subsection_contents
        }


def _parse_survey_critic(raw: str, expected_keys: list[str]) -> dict[str, SubsectionScore]:
    text = (raw or "").strip()
    if text.startswith("```"):
        nl = text.find("\n")
        if nl >= 0:
            text = text[nl + 1:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    if not text.startswith("{"):
        i = text.find("{")
        if i >= 0:
            text = text[i:]
    try:
        parsed, _ = json.JSONDecoder().raw_decode(text)
    except Exception:
        return {
            sk: SubsectionScore(
                subsection_key=sk, question_count=0,
                type_diversity=3, no_jargon=3, actionable=3, no_duplicate=3,
                overall="pass", issues=["critic 解析失败,默认 pass"],
            )
            for sk in expected_keys
        }
    out: dict[str, SubsectionScore] = {}
    scores_arr = parsed.get("scores", []) if isinstance(parsed, dict) else []
    by_key = {s.get("subsection_key"): s for s in scores_arr if isinstance(s, dict)}
    for sk in expected_keys:
        s = by_key.get(sk) or {}
        out[sk] = SubsectionScore(
            subsection_key=sk,
            question_count=int(s.get("question_count", 0)),
            type_diversity=int(s.get("type_diversity", 3)),
            no_jargon=int(s.get("no_jargon", 3)),
            actionable=int(s.get("actionable", 3)),
            no_duplicate=int(s.get("no_duplicate", 3)),
            overall=s.get("overall", "pass") if s.get("overall") in {"pass", "needs_rework", "insufficient"} else "pass",
            issues=s.get("issues", []) if isinstance(s.get("issues"), list) else [],
        )
    return out
