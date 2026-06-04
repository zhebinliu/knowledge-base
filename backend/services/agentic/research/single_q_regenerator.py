"""单题改写器 — 允许已生成的题目手动重新生成(2026-06-03)。

用户用例:点♻️ 按钮对单道题重新生成 — 保留 item_key / session_id / topic_cluster /
interview_stage / audience_roles / ltc_module_key / phase 不变,只重写 question / why /
options / hint,让题目更精准。

设计取舍:
- 同步 LLM(不走 Celery)— 单题约 5-15 秒,nginx 默认 180s 内出
- max_tokens 2500 给单题足量(question + why + 8-12 options + hint)
- 保留所有"挂载"字段(session/topic/stage/role/ltc)— 用户重生只对内容不动结构
- LLM 看到同场其他题作为上下文,避免改写后跟其他题重合
"""
from __future__ import annotations

import json
import re
import structlog

logger = structlog.get_logger()


SYSTEM_PROMPT = """你是 MBB 风格的资深 CRM 实施咨询顾问。**用户对一道已经生成的调研题不满意,请你改写。**

【强约束】
- 保留题的"挂载身份"不变:item_key / session_id / topic_cluster / interview_stage /
  audience_roles / ltc_module_key / phase / type / required 都**不要改**
- 只改写: question(题干)、why(为什么问)、options(选项,若 type 是 single/multi/node_pick)、
  hint(可选提示)、rating_scale(rating 题)、number_unit(number 题)
- 改写方向(LLM 自主判断哪个最该改):
  - 太浅 → 改成更具体可作答的(把"贵司销售流程如何?"改成"线索分配是按区域、按行业还是按客户金额?")
  - 太重/太复杂 → 拆分焦点,问一个核心子项
  - 措辞绕 → 用客户日常语言重写
  - 选项不全 → 补全选项池,或缩减冗余选项
  - 问的话题已经在同场其他题问过 → 换一个补足覆盖的角度
- 维持 type:type=single 改写后仍是 single;不要换题型
- options 兼顾完整性:single/multi/node_pick 必须含 __other__ + __na__ 兜底

【输出格式】
只输出 1 个 JSON 对象(用 ```json``` 围栏包裹),包含改写后的字段。
**不要**输出 markdown 题列表,**不要**输出多个题。

```json
{
  "question": "<改写后的题干>",
  "why": "<改写后的为什么问>",
  "options": [
    {"value": "<英文小写下划线>", "label": "<中文标签>"},
    ...
    {"value": "__other__", "label": "其他(请说明)", "is_other": true},
    {"value": "__na__",   "label": "不适用",       "is_not_applicable": true}
  ],
  "rating_scale": 5,
  "number_unit": "",
  "hint": "<给顾问的补充提示, 可空>"
}
```

text/number/rating 题的 options 留空 []。
"""


def _format_item_full(item: dict) -> str:
    """把原题渲染成 markdown 让 LLM 读得清楚。"""
    lines = [
        f"【原题】",
        f"- item_key: {item.get('item_key')}",
        f"- 题型: {item.get('type')}",
        f"- 题干: {item.get('question')}",
        f"- 为什么问: {item.get('why') or '—'}",
    ]
    opts = item.get("options") or []
    if opts:
        lines.append("- 选项:")
        for o in opts:
            v = o.get("value", "")
            lbl = o.get("label", "")
            tag = ""
            if o.get("is_other"):
                tag = "(其他)"
            elif o.get("is_not_applicable"):
                tag = "(不适用)"
            lines.append(f"  · {lbl} [{v}] {tag}")
    if item.get("rating_scale"):
        lines.append(f"- rating_scale: {item['rating_scale']}")
    if item.get("number_unit"):
        lines.append(f"- number_unit: {item['number_unit']}")
    if item.get("hint"):
        lines.append(f"- 当前 hint: {item['hint']}")
    return "\n".join(lines)


def _format_session_block(session: dict | None) -> str:
    if not session:
        return ""
    return (
        "【本题所属场次】\n"
        f"- session_id: {session.get('session_id')}\n"
        f"- 时间: {session.get('week', '')} {session.get('time_slot', '')}\n"
        f"- 类型: {session.get('session_type', '集中访谈')}\n"
        f"- 参会者: {session.get('participants', '')}\n"
        f"- 议题: {session.get('topic_summary', '')}\n"
    )


def _format_other_items_in_session(items: list[dict], current_key: str, max_n: int = 15) -> str:
    others = [it for it in items if it.get("item_key") != current_key and not it.get("parent_item_key")]
    if not others:
        return ""
    lines = [f"【本场其他已有题 ({len(others)} 题,以下为前 {max_n} 题缩略) — 不要让改写后跟它们重叠】"]
    for it in others[:max_n]:
        q = (it.get("question") or "")[:80]
        lines.append(f"- {q}")
    return "\n".join(lines)


def build_user_prompt(*, item: dict, session: dict | None, other_items_in_session: list[dict]) -> str:
    return f"""请重新生成下面这道调研题。**只改写题目内容,保留挂载身份字段不变**。

{_format_item_full(item)}

{_format_session_block(session)}

【本题的主题/阶段/角色 — 改写后保持一致】
- topic_cluster: {item.get('topic_cluster') or '—'}
- interview_stage: {item.get('interview_stage') or '—'}
- audience_roles: {', '.join(item.get('audience_roles') or [])}
- ltc_module_key: {item.get('ltc_module_key') or '—'}
- phase: {item.get('phase') or 'in_meeting'}

{_format_other_items_in_session(other_items_in_session, item.get('item_key', ''))}

按 system prompt 要求输出单个 JSON(```json``` 围栏)。
"""


_JSON_FENCE_RE = re.compile(r"```json\s*(\{[\s\S]*?\})\s*```", re.IGNORECASE)


def _parse_one(raw: str) -> dict | None:
    """从 LLM 输出里拆出单个对象。失败返回 None。"""
    m = _JSON_FENCE_RE.search(raw or "")
    if m:
        txt = m.group(1)
    else:
        i = (raw or "").find("{")
        j = (raw or "").rfind("}")
        if not (0 <= i < j):
            return None
        txt = raw[i:j + 1]
    try:
        data = json.loads(txt)
    except Exception as e:
        logger.warning("single_q_parse_failed", err=str(e)[:200])
        return None
    if not isinstance(data, dict):
        return None
    return data


async def regenerate_item(
    *,
    item: dict,
    session: dict | None,
    other_items_in_session: list[dict],
    model: str | None,
) -> dict | None:
    """LLM 改写单题。成功返回新 item dict(已合并原挂载字段);失败返回 None。"""
    from services.output_service import _llm_call
    from services.agentic.research.questionnaire_schema import ensure_sentinels, OptionItem

    user_prompt = build_user_prompt(
        item=item, session=session,
        other_items_in_session=other_items_in_session,
    )
    try:
        content = await _llm_call(
            user_prompt, system=SYSTEM_PROMPT,
            model=model, task="output_doc_generate",
            max_tokens=2500, timeout=90.0,
        )
    except Exception as e:
        logger.warning("single_q_llm_failed", item_key=item.get("item_key"), err=str(e)[:200])
        return None
    parsed = _parse_one(content or "")
    if not parsed:
        return None

    # 合并:保留原挂载字段 + 用 LLM 输出覆盖内容字段
    new_item = dict(item)
    for fld in ("question", "why", "hint"):
        v = parsed.get(fld)
        if isinstance(v, str) and v.strip():
            new_item[fld] = v.strip()
    # options 重新校验 + 兜底 sentinel
    opts_raw = parsed.get("options") or []
    qtype = item.get("type")
    if qtype in ("single", "multi", "node_pick"):
        opts: list = []
        seen = set()
        for o in opts_raw:
            if not isinstance(o, dict):
                continue
            val = (o.get("value") or "").strip()
            lbl = (o.get("label") or "").strip()
            if not val or not lbl or val in seen:
                continue
            seen.add(val)
            opts.append(OptionItem(
                value=val, label=lbl,
                is_other=bool(o.get("is_other")),
                is_not_applicable=bool(o.get("is_not_applicable")),
            ))
        if opts:
            opts = ensure_sentinels(opts)
            new_item["options"] = [o.to_dict() for o in opts]
    elif qtype == "rating":
        rs = parsed.get("rating_scale")
        try:
            new_item["rating_scale"] = int(rs) if rs else item.get("rating_scale", 5)
        except Exception:
            pass
        new_item["options"] = []
    elif qtype == "number":
        nu = (parsed.get("number_unit") or "").strip()
        if nu:
            new_item["number_unit"] = nu
        new_item["options"] = []
    else:
        new_item["options"] = []

    # 重生后 source 改成 ai(人工编辑过的题再重生 → 仍按 ai 看待)
    new_item.setdefault("source", "ai")
    # 最佳实践建议清掉(后续可重新生成)
    new_item.pop("best_practice_advice", None)
    return new_item
