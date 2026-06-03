"""按场次生成调研问卷题目(2026-06-03)。

用户希望一场一场手动触发生成,不再强制一键全量。每场调用一次本生成器:
- 喂该场的完整场次信息(participants / topic_summary / interview_script / audience_roles)
- 喂大纲全部场次(让 LLM 知道其他场已经涵盖什么 → 避免题目跨场重复)
- 喂现有 bundle 已有题(prior_items)再次去重
- 输出 8-15 题,全部 session_id 强制 = 该场

不复用 executor.execute_survey_subsection 的原因:
- subsection 是按 LTC 主题划分的,跟"场次"是不同维度;按场次出题应直接以场次为单元
- 场次的 participants / interview_script 给了具体场景,LLM 出题更聚焦
"""
from __future__ import annotations

import json
import re
import structlog

logger = structlog.get_logger()


SYSTEM_PROMPT = """你是 MBB 风格的资深 CRM 实施咨询顾问。**用户现在只让你为某一场访谈生成调研题目**,
而不是出整本问卷。本场题目要紧扣场次信息(参会者 / 议题 / 访谈剧本),不要发散到其他场。

输出**两段**:Markdown 题目列表 + JSON 结构化数据。两段题目必须一一对应。

【设计原则】
- 题型分布: 60% single/multi + 15% rating + 10% number + 10% text + 5% node_pick
- 题量: **8-15 题**(场次议题深度决定;不少于 8,不多于 15)
- 每题颗粒度具体到客户能直接作答,不要"贵司流程如何"这种泛泛
- 已经在大纲其他场次覆盖的子主题不要重复出
- 全简体中文;不写黑话(赋能/抓手/闭环/链路/生态)

【session_id 强约束】
- **本批次所有题的 session_id 必须 = 用户指定的本场 id**(下方 user prompt 给)
- **绝对不要**给其他场次的 id

【其他必填字段】
- topic_cluster: 3-8 字短中文,本场内 2-4 个不重复 cluster(场次内细话题)
- interview_stage: opening / current_state / pain_point / aspiration
  同 cluster 内题按这个顺序排
- ltc_module_key: 从 user prompt 的 LTC 候选 + 客户自定义中选最贴合的 1 个
- audience_roles: 严格 4 选 N(executive / dept_head / frontline / it),
  跟本场 audience_roles 一致(单场通常 1-2 个角色)
- phase: pre_meeting / in_meeting(开放深挖题 in_meeting 比例 70%+)
- item_key: 用 user prompt 给的前缀 + 简短英文/中文小写下划线;**确保稳定**

【硬性约束 — 严格遵守,否则解析会失败】
- single/multi/node_pick 题的 options 必须含 __other__ 和 __na__ 兜底
- text/number/rating 题 options 留空 []
- rating 题填 rating_scale=5;number 题填 number_unit
- JSON 必须可被 json.loads 解析(双引号 / 末尾无逗号 / 不写注释)
- Markdown 与 JSON 数量、顺序、题干必须一一对应
"""


def _format_session_block(s: dict) -> str:
    lines = [
        f"【本场信息 — 题目必须紧扣这一场】",
        f"- session_id:**{s.get('session_id', '?')}**(所有题的 session_id 必须填这个,不要写别的)",
        f"- 时间:{s.get('week', '')} {s.get('time_slot', '')}",
        f"- 时长:{s.get('duration_minutes') or '—'} 分钟",
        f"- 类型:{s.get('session_type', '集中访谈')}",
        f"- 受众角色:{', '.join(s.get('audience_roles') or [])}(题目 audience_roles 跟这里一致)",
        f"- 参会者:{s.get('participants', '')}",
        f"- 议题:{s.get('topic_summary', '')}",
    ]
    script = (s.get("interview_script") or "").strip()
    if script:
        lines.append(f"- 访谈剧本(给顾问做现场指导,出题时围绕这个语境):\n  {script}")
    return "\n".join(lines)


def _format_all_sessions_brief(all_sessions: list[dict], current_id: str) -> str:
    """其他场次的简短清单 — 帮 LLM 避免跨场重复出题。"""
    lines = ["【大纲全部场次速览 — 不要把别场议题重复在本场出】"]
    for s in all_sessions:
        sid = s.get("session_id", "?")
        mark = " ← 本场" if sid == current_id else ""
        roles = ",".join(s.get("audience_roles") or [])
        lines.append(
            f"- {sid}:{s.get('week', '')} {s.get('time_slot', '')} | "
            f"角色:{roles} | 议题:{s.get('topic_summary', '')}{mark}"
        )
    return "\n".join(lines)


def _format_prior_items_brief(prior_items: list[dict], current_session_id: str, max_n: int = 30) -> str:
    """已有题目里非本场的题(用于让 LLM 知道已经问过什么,避免撞车)。"""
    other = [it for it in prior_items if (it.get("session_id") and it.get("session_id") != current_session_id)]
    if not other:
        return ""
    lines = [f"【其他场次已有题 ({len(other)} 题,以下为前 {max_n} 题缩略) — 不要重复】"]
    for it in other[:max_n]:
        sid = it.get("session_id") or "?"
        q = (it.get("question") or "")[:80]
        lines.append(f"- [{sid}] {q}")
    return "\n".join(lines)


def build_user_prompt(
    *,
    session: dict,
    all_sessions: list[dict],
    prior_items: list[dict],
    project_block: str,
    industry: str | None,
    ltc_dict_block: str,
    item_key_prefix: str,
    transcript: str = "",
) -> str:
    session_block = _format_session_block(session)
    all_brief = _format_all_sessions_brief(all_sessions, session.get("session_id", ""))
    prior_brief = _format_prior_items_brief(prior_items, session.get("session_id", ""))
    transcript_block = (transcript or "")[:6000]

    return f"""请为下面这**一场访谈**生成 8-15 题调研题目。

{session_block}

{all_brief}

{prior_brief}

{ltc_dict_block}

【项目元数据】
{project_block}

【访谈记录(若有)】
{transcript_block or '（无访谈记录,按场次信息出题)'}

【输出格式】

**第一段:Markdown 题目列表**(给顾问可读)
顶部加一句话:本场访谈的目标 / 预计填答时间。

每题格式:
```
### N. <问题正文>
- 类型: [single / multi / rating / number / text / node_pick]
- *为什么问:* <一句话>
- *答案如何使用:* <一句话>
- 选项(single/multi/node_pick 必填): A. ... / B. ... / C. ... / 其他(请说明) / 不适用
```

**第二段:结构化 JSON**(给系统消费)— 用 ```json``` 围栏包裹,顶层数组
```json
[
  {{
    "item_key": "{item_key_prefix}::<英文小写下划线>",
    "session_id": "{session.get('session_id', '?')}",
    "ltc_module_key": "<必须从 LTC 字典选 1 个 key>",
    "audience_roles": ["<严格 4 选 N,跟本场一致>"],
    "phase": "<pre_meeting / in_meeting>",
    "topic_cluster": "<本场内主题聚类,3-8 字短中文>",
    "interview_stage": "<opening / current_state / pain_point / aspiration>",
    "type": "single | multi | rating | number | text | node_pick",
    "question": "<同上方第 N 题的问题正文>",
    "why": "<同 *为什么问*>",
    "options": [
      {{"value": "<英文小写下划线>", "label": "<中文标签>"}},
      ...
      {{"value": "__other__", "label": "其他(请说明)", "is_other": true}},
      {{"value": "__na__",   "label": "不适用",       "is_not_applicable": true}}
    ],
    "rating_scale": 5,
    "number_unit": "<如「天」「万元」「%」, type=number 才用>",
    "required": true,
    "hint": ""
  }},
  ...
]
```
"""


_JSON_FENCE_RE = re.compile(r"```json\s*(\[[\s\S]*?\])\s*```", re.IGNORECASE)


def _parse_items(raw: str) -> tuple[str, list[dict]]:
    """从 LLM 输出里拆出 markdown 段 + JSON 数组。失败返回 (raw, [])。"""
    m = _JSON_FENCE_RE.search(raw or "")
    if not m:
        i, j = raw.rfind("["), raw.rfind("]")
        if 0 <= i < j:
            try:
                items_raw = json.loads(raw[i:j + 1])
                if isinstance(items_raw, list):
                    return raw[:i].rstrip(), items_raw
            except Exception:
                pass
        return raw, []
    try:
        items_raw = json.loads(m.group(1))
    except Exception:
        return raw, []
    if not isinstance(items_raw, list):
        return raw, []
    fence_idx = raw.rfind("```json")
    markdown = raw[:fence_idx].rstrip() if fence_idx > 0 else raw
    return markdown, items_raw


async def generate_session_items(
    *,
    session: dict,
    all_sessions: list[dict],
    prior_items: list[dict],
    project,
    industry: str | None,
    transcript: str,
    item_key_prefix: str,
    candidate_ltc_keys: list[str],
    customer_modules: list[str],
    model: str | None,
) -> tuple[str, list[dict]]:
    """LLM 一次性出本场的题目。返回 (markdown, items)。

    items 是 raw LLM 输出经 _parse_items 后的字典列表;调用方应再走 executor._post_process_items
    做角色/sentinel/兜底校验,并强制 session_id = 本场 id。
    """
    from services.output_service import _llm_call
    from .ltc_dictionary import ALL_LTC_MODULES
    from services.agentic.executor import _format_project_block

    # 复用 executor 的 LTC 字典块构造逻辑(简化版)
    lines = ["【LTC 流程模块字典 — ltc_module_key 必须从这些 key 中选】"]
    for m in ALL_LTC_MODULES:
        marker = "★" if m.key in (candidate_ltc_keys or []) else " "
        lines.append(f"  {marker} {m.key}: {m.label}")
    if customer_modules:
        lines.append("\n【本项目客户自定义模块 — 也是合法 ltc_module_key】")
        for sow_term in customer_modules:
            lines.append(f"  ☆ {sow_term}")
    ltc_dict_block = "\n".join(lines)

    user_prompt = build_user_prompt(
        session=session,
        all_sessions=all_sessions,
        prior_items=prior_items,
        project_block=_format_project_block(project),
        industry=industry,
        ltc_dict_block=ltc_dict_block,
        item_key_prefix=item_key_prefix,
        transcript=transcript,
    )
    try:
        content = await _llm_call(
            user_prompt, system=SYSTEM_PROMPT,
            model=model, task="output_doc_generate",
            max_tokens=8000, timeout=240.0,
        )
    except Exception as e:
        logger.warning("session_q_llm_failed", session_id=session.get("session_id"), err=str(e)[:200])
        return "", []
    markdown, items = _parse_items(content or "")
    logger.info("session_q_parsed",
                session_id=session.get("session_id"),
                items_n=len(items), raw_chars=len(content or ""))
    return markdown, items
