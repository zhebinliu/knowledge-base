"""从项目下已有会议的纪要 / 需求里给调研问卷题目提建议答案。

定位:
- 不直接写答案 — 顾问看到建议条后,点「采纳」才走 upsert_response。
- 服务于「需求调研工作流提速」:第一次访谈如果已经出过纪要,顾问开第二轮会的时候
  不用再把答案手敲一遍。
- 复用现有 _llm_call,不引入新的 LLM 路由配置。

输入 bundle_id → 拉:
  1) bundle.extra.questionnaire_items[]
  2) Meeting where project_id == bundle.project_id 的所有「completed」会议
  3) 每个会议的 minutes(summary / key_points / decisions / action_items) +
     Requirement 行(描述 / module / speaker / priority)
LLM 输出 → 每题 0-1 条建议 + 来源会议 / 截取证据 / 置信度。

只支持 single / multi / text 三种题型(rating / number / node_pick 暂跳过,
后续再加 — 那几种结构化更复杂,需要单独 prompt)。
"""
import json
import structlog
from sqlalchemy import select

from models import async_session_maker
from models.curated_bundle import CuratedBundle
from models.research_response import ResearchResponse

logger = structlog.get_logger()

SUPPORTED_TYPES = {"single", "multi", "text"}
# 控制 prompt 体量上限:每个会议最多取 N 条 requirement / N 条 key_point
MAX_REQ_PER_MEETING = 30
MAX_KP_PER_MEETING = 10


async def propose_answers_from_meetings(
    bundle_id: str,
    *,
    only_unanswered: bool = True,
    model: str | None = None,
) -> dict:
    """对一个 survey bundle 的题目,基于本项目下的 completed 会议给出建议答案。

    Args:
        bundle_id: survey kind 的 bundle id
        only_unanswered: 默认只对没顾问答案的题目跑(避免覆盖已录入的)
        model: 可选模型 override

    Returns:
        {
            "suggestions": [{
                "item_key": str,
                "suggested_value": Any,    # 适配题型:single → option value;multi → [value];text → str
                "suggested_label": str,    # 给前端 chip 显示的人类可读形式
                "evidence": str,           # 一段截取(<= 240 字)
                "source_meeting_id": int,
                "source_meeting_title": str,
                "confidence": float        # 0~1
            }, ...],
            "meetings_used": int,
            "items_total": int,
            "items_considered": int,    # 进入 LLM 的题目数
            "errors": list[str]
        }
    """
    # 1) 拉 bundle + 项目下会议(延迟 import 避免和主仓 meeting overlay 形成循环)
    async with async_session_maker() as s:
        bundle = await s.get(CuratedBundle, bundle_id)
        if not bundle:
            return _empty_result(["bundle not found"])
        if bundle.kind != "survey":
            return _empty_result([f"bundle kind={bundle.kind}, 只支持 kind=survey"])
        project_id = bundle.project_id
        if not project_id:
            return _empty_result(["bundle 没绑定项目,无法关联会议"])

    items_all = (bundle.extra or {}).get("questionnaire_items") or []
    if not items_all:
        return _empty_result(["bundle.extra.questionnaire_items 为空"])

    # 2) 已答的题目(按 only_unanswered 过滤掉)
    answered_keys: set[str] = set()
    if only_unanswered:
        async with async_session_maker() as s:
            rows = (await s.execute(
                select(ResearchResponse).where(
                    ResearchResponse.bundle_id == bundle_id,
                    ResearchResponse.answer_value.isnot(None),
                )
            )).scalars().all()
            answered_keys = {r.item_key for r in rows}

    # 3) 候选题目:不带子题,题型在支持范围内,未答(若 only_unanswered)
    candidate_items: list[dict] = []
    for it in items_all:
        if it.get("parent_item_key"):
            continue  # follow-up 题不参与自动回填
        if it.get("type") not in SUPPORTED_TYPES:
            continue
        if only_unanswered and it.get("item_key") in answered_keys:
            continue
        candidate_items.append(it)

    if not candidate_items:
        return _empty_result([], meetings_used=0, items_total=len(items_all))

    # 4) 拉会议:Meeting 模型在 meeting overlay 里,延迟 import
    from models.meeting import Meeting, Requirement
    async with async_session_maker() as s:
        meetings = (await s.scalars(
            select(Meeting)
            .where(Meeting.project_id == project_id)
            .where(Meeting.status == "completed")
            .order_by(Meeting.created_at.desc())
        )).all()
        if not meetings:
            return _empty_result(
                ["该项目下没有已完成的会议,无法生成建议"],
                meetings_used=0,
                items_total=len(items_all),
                items_considered=len(candidate_items),
            )

        meeting_ids = [m.id for m in meetings]
        reqs = (await s.scalars(
            select(Requirement)
            .where(Requirement.meeting_id.in_(meeting_ids))
            .order_by(Requirement.meeting_id, Requirement.id)
        )).all()
    reqs_by_meeting: dict[int, list] = {}
    for r in reqs:
        reqs_by_meeting.setdefault(r.meeting_id, []).append(r)

    # 5) 构造证据包
    evidence_blocks = _build_evidence_blocks(meetings, reqs_by_meeting)
    if not evidence_blocks.strip():
        return _empty_result(
            ["会议纪要 / 需求都为空,没素材可用"],
            meetings_used=len(meetings),
            items_total=len(items_all),
            items_considered=len(candidate_items),
        )

    # 6) LLM
    suggestions = await _propose_with_llm(
        candidate_items=candidate_items,
        evidence_blocks=evidence_blocks,
        model=model,
    )

    # 7) 附加 meeting title(LLM 只返回 id)
    title_by_id = {m.id: m.title for m in meetings}
    for s_item in suggestions:
        mid = s_item.get("source_meeting_id")
        if mid:
            s_item["source_meeting_title"] = title_by_id.get(mid) or f"会议 #{mid}"

    logger.info(
        "meeting_autofill_done",
        bundle_id=bundle_id,
        project_id=project_id,
        meetings=len(meetings),
        items_considered=len(candidate_items),
        suggested=len(suggestions),
    )
    return {
        "suggestions": suggestions,
        "meetings_used": len(meetings),
        "items_total": len(items_all),
        "items_considered": len(candidate_items),
        "errors": [],
    }


def _empty_result(
    errors: list[str], *,
    meetings_used: int = 0, items_total: int = 0, items_considered: int = 0,
) -> dict:
    return {
        "suggestions": [],
        "meetings_used": meetings_used,
        "items_total": items_total,
        "items_considered": items_considered,
        "errors": errors,
    }


def _build_evidence_blocks(meetings, reqs_by_meeting) -> str:
    """渲染会议证据成纯文本块给 LLM 看。"""
    blocks: list[str] = []
    for m in meetings:
        mm = m.meeting_minutes or {}
        chunk: list[str] = [f"### 会议 #{m.id}:{m.title or '未命名'}"]
        if mm.get("summary"):
            chunk.append(f"摘要:{str(mm['summary'])[:400]}")

        key_points = mm.get("key_points") or []
        if isinstance(key_points, list) and key_points:
            chunk.append("讨论要点:")
            for kp in key_points[:MAX_KP_PER_MEETING]:
                if not isinstance(kp, dict):
                    continue
                topic = (kp.get("topic") or "").strip()
                content = (kp.get("content") or "").strip()
                if topic or content:
                    chunk.append(f"- 【{topic}】{content[:200]}")

        decisions = mm.get("decisions") or []
        if isinstance(decisions, list) and decisions:
            chunk.append("决议:")
            for d in decisions[:6]:
                if isinstance(d, dict):
                    content = (d.get("content") or "").strip()
                    if content:
                        chunk.append(f"- {content[:200]}")

        reqs = reqs_by_meeting.get(m.id) or []
        if reqs:
            chunk.append(f"提取的需求 ({len(reqs)} 条):")
            for r in reqs[:MAX_REQ_PER_MEETING]:
                module = (r.module or "").strip()
                desc = (r.description or "").strip()
                speaker = (r.speaker or "").strip()
                pri = (r.priority or "").strip()
                head = f"[{r.req_id} · {pri}]"
                tail = f"({speaker})" if speaker else ""
                chunk.append(f"- {head} 【{module}】{desc[:200]} {tail}".strip())

        # 没东西就跳过
        if len(chunk) > 1:
            blocks.append("\n".join(chunk))
    return "\n\n".join(blocks)


def _format_item_for_prompt(idx: int, it: dict) -> str:
    """单题的 prompt 渲染。"""
    qtype = it.get("type")
    lines = [
        f"[#{idx}] item_key={it['item_key']} | 题型={qtype}",
        f"  问:{it.get('question', '')}",
    ]
    why = (it.get("why") or "").strip()
    if why:
        lines.append(f"  目的:{why[:200]}")
    ltc = it.get("ltc_module_key") or ""
    if ltc:
        lines.append(f"  LTC 模块:{ltc}")

    if qtype in ("single", "multi"):
        opts = it.get("options") or []
        if opts:
            opt_lines = []
            for o in opts:
                if not isinstance(o, dict):
                    continue
                tags = []
                if o.get("is_other"):
                    tags.append("其他")
                if o.get("is_not_applicable"):
                    tags.append("不适用")
                tag_str = f" [{','.join(tags)}]" if tags else ""
                opt_lines.append(f"    - value={o.get('value')} → {o.get('label', '')}{tag_str}")
            lines.append("  选项池:")
            lines.extend(opt_lines)
    return "\n".join(lines)


async def _propose_with_llm(
    *,
    candidate_items: list[dict],
    evidence_blocks: str,
    model: str | None,
) -> list[dict]:
    """一次性把候选题+证据包扔给 LLM,返回建议数组。"""
    from services.output_service import _llm_call

    cand_text = "\n\n".join(
        _format_item_for_prompt(i + 1, it) for i, it in enumerate(candidate_items)
    )

    system = """你是 CRM 实施顾问的 AI 助手。任务:从客户会议纪要/需求清单里,给一份待录入的
调研问卷题目找出可能已经被回答过的部分,生成「建议答案」。

输出原则:
1. 严格只用会议证据 — 没有明确依据就 NOT 输出该题(保守为先,顾问最讨厌瞎猜)。
2. 一题最多一条建议,从最具说服力的那一次会议里取,不要混合多场会议的内容。
3. value 必须严格匹配题型:
   - single  → 必须等于选项池里某一项的 value(字符串)。如果证据指向「其他」选项,
              用 "__other__:<自由文本>" 这种形式;实在没合适选项就不输出。
   - multi   → 数组,每个元素必须等于选项池里某一项的 value(可空数组,但空就不输出)。
   - text    → 一段 ≤ 80 字的简洁回答,提炼自证据,别照抄。
4. evidence:从原文截取的相关片段(≤ 240 字),让顾问点采纳时一眼看到底据是什么。
5. source_meeting_id:证据来自哪场会议的 id(必须是输入证据块里出现过的 id)。
6. confidence:0~1 浮点。≥ 0.75 = 证据强匹配;0.5~0.75 = 部分契合;< 0.5 = 不输出。

严格输出 JSON,不要 markdown 围栏,不要解释:
{
  "suggestions": [
    {
      "item_key": "<原 item_key>",
      "suggested_value": <按题型>,
      "suggested_label": "<人类可读摘要,顾问一眼能看懂的建议形式;比如 multi 题就 '采购 / 物流 / 财务'>",
      "evidence": "<≤240 字>",
      "source_meeting_id": <int>,
      "confidence": <0~1>
    }
  ]
}"""

    user = f"""【会议证据】
{evidence_blocks}

【待填题目】
{cand_text}

请基于上面证据,按格式输出可信度足够(confidence ≥ 0.5)的建议。
没有证据支撑的题目直接不要出现在 suggestions 数组里。"""

    try:
        raw = await _llm_call(user, system=system, model=model,
                              max_tokens=4000, timeout=180.0)
    except Exception as e:
        logger.warning("meeting_autofill_llm_failed", error=str(e)[:200])
        return []

    parsed = _parse_json_robust(raw)
    raw_arr = (parsed.get("suggestions") or []) if isinstance(parsed, dict) else []
    if not isinstance(raw_arr, list):
        return []

    # 校验 + 兜底
    item_by_key = {it["item_key"]: it for it in candidate_items}
    valid_meeting_ids = set()  # 留空表示不强校,后面用 title_by_id 兜底
    out: list[dict] = []
    seen_keys: set[str] = set()
    for s_item in raw_arr:
        if not isinstance(s_item, dict):
            continue
        key = s_item.get("item_key")
        if not key or key not in item_by_key or key in seen_keys:
            continue
        seen_keys.add(key)
        it = item_by_key[key]
        qtype = it.get("type")
        value = s_item.get("suggested_value")
        # 题型校验
        if qtype == "single":
            if not isinstance(value, str) or not value:
                continue
            opt_values = {o.get("value") for o in (it.get("options") or []) if isinstance(o, dict)}
            if not value.startswith("__other__:") and value not in opt_values:
                # value 不在选项池里 → 丢弃
                continue
        elif qtype == "multi":
            if not isinstance(value, list) or not value:
                continue
            opt_values = {o.get("value") for o in (it.get("options") or []) if isinstance(o, dict)}
            value = [v for v in value if isinstance(v, str) and v in opt_values]
            if not value:
                continue
        elif qtype == "text":
            if not isinstance(value, str) or not value.strip():
                continue
            value = value.strip()[:200]
        else:
            continue
        try:
            confidence = float(s_item.get("confidence") or 0)
        except (TypeError, ValueError):
            confidence = 0.0
        if confidence < 0.5:
            continue
        try:
            source_mid = int(s_item.get("source_meeting_id") or 0)
        except (TypeError, ValueError):
            source_mid = 0
        out.append({
            "item_key": key,
            "suggested_value": value,
            "suggested_label": str(s_item.get("suggested_label") or "")[:200],
            "evidence": str(s_item.get("evidence") or "")[:240],
            "source_meeting_id": source_mid,
            "confidence": round(confidence, 2),
        })
    return out


def _parse_json_robust(text: str) -> dict:
    if not text:
        return {}
    s = text.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[-1]
        if s.endswith("```"):
            s = s.rsplit("```", 1)[0]
    try:
        return json.loads(s)
    except Exception:
        i, j = s.find("{"), s.rfind("}")
        if 0 <= i < j:
            try:
                return json.loads(s[i:j+1])
            except Exception:
                pass
    return {}
