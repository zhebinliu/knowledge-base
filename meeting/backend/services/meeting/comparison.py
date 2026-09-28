"""跨会议对比服务:把本场会议与项目上一场会议横向比,输出变化洞察 + 建议(2026-09)。

**只建在 `meeting/backend/` 这一份,不要在 `backend/services/meeting/` 建同名副本。**
理由同 insights.py / module_export.py / module_layouts.py:Dockerfile 是二次 COPY 的 overlay
(`COPY backend/ /app/` 之后 `COPY meeting/backend/ /app/`,后者胜),只在 overlay 建一份即可。
两处同名 → 后 COPY 的静默胜出 → 以后改错文件不生效(名词校正词典就是这么失效的)。

对外入口:
- `find_previous_meeting()`    → 「上一场」(默认建议项;也是旧任务的兼容兜底)
- `find_comparable_meetings()` → 本项目全部可对比会议,供前端下拉取候选
- `load_comparable_meeting()`  → 按 id 取并校验,**权限与数据的唯一关口**
- `build_comparison()`         → 真正跑对比,返回可落 `Meeting.comparison_insight` 的 dict

反幻觉策略(这是本模块最要紧的事):
- 每条 change 强制带 `evidence`,且 evidence 必须是材料里的原文摘录;
  Python 侧再用「材料里是否真的出现过这段文字」做一次软校验,过不了就丢弃该条
  —— 与 insights.py 里词云的 `str.count` 落地同一个思路:模型说的话要用原文背书。
- 「上一场有、这一场没提」判成「停滞」而不是「回退」,也写进了 prompt。
- 两场都拿不到有效材料时直接失败,不调模型,免得凭空编一篇对比出来。
"""
from __future__ import annotations

import structlog
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.meeting import Meeting, Requirement
from services._time import iso_utc, utcnow_naive
from services.meeting.pipeline import _json_output_valid
from services.model_router import model_router

logger = structlog.get_logger()

# 转写摘录上限:对比的判据主要是结构化纪要,转写只用来补充细节,不必喂全量
_TRANSCRIPT_EXCERPT = 8000
# 需求清单条数上限
_MAX_REQUIREMENTS = 40

# evidence 软校验的最短长度:太短的片段(如「好的」「嗯」)在材料里必然命中,
# 起不到取证作用,反而会放过编造的内容
_MIN_EVIDENCE_CHARS = 8

_EMPTY_COMPARISON: dict = {"summary": "", "changes": [], "suggestions": []}

_VALID_TRENDS = {"推进", "停滞", "新增", "回退", "无变化"}
_VALID_PRIORITIES = {"高", "中", "低"}


def _now_iso() -> str:
    return iso_utc(utcnow_naive()) or ""


async def find_previous_meeting(meeting: Meeting, session: AsyncSession) -> Meeting | None:
    """同项目里,start_time 早于本场、且已经有纪要的最近一场。

    为什么要求「有纪要」:对比的判据主要是结构化纪要,没有纪要的会议(还在录音、
    转写失败)拿来比只会得到一篇空洞的对比。宁可让前端提示「上一场还没出纪要」。

    2026-09 起这只是**默认建议项**:用户可以在前端选任意一场同项目会议
    (见 `find_comparable_meetings`),这个函数退化为「没传 prev_id 时的兜底选择」,
    同时兼作已入队旧任务的兼容路径。
    """
    if not meeting.project_id:
        return None
    stmt = (
        select(Meeting)
        .where(
            and_(
                Meeting.project_id == meeting.project_id,
                Meeting.id != meeting.id,
                Meeting.start_time < meeting.start_time,
                Meeting.meeting_minutes.isnot(None),
            )
        )
        .order_by(Meeting.start_time.desc())
        .limit(1)
    )
    return (await session.scalars(stmt)).first()


async def find_comparable_meetings(meeting: Meeting, session: AsyncSession) -> list[Meeting]:
    """本项目里所有**可作对比基准**的会议:非自己、且已出纪要。按 start_time 倒序。

    与 `find_previous_meeting` 的关键区别:**不限制早于本场**。用户可能想拿更晚的会议
    作参照(比如回头补一次对比),所以时间先后不参与筛选。

    「已出纪要」这条与 `find_previous_meeting` 一致,理由同上;也必须与
    `load_comparable_meeting` 的校验保持一致 —— 前端下拉里拿得到的,提交时就必须通过。
    """
    if not meeting.project_id:
        return []
    stmt = (
        select(Meeting)
        .where(
            and_(
                Meeting.project_id == meeting.project_id,
                Meeting.id != meeting.id,
                Meeting.meeting_minutes.isnot(None),
            )
        )
        .order_by(Meeting.start_time.desc())
    )
    return list(await session.scalars(stmt))


async def load_comparable_meeting(
    meeting: Meeting, prev_id: int, session: AsyncSession
) -> Meeting | None:
    """按 id 取一场「可对比的会议」;不满足条件返回 None,由调用方转成可读的 400。

    **这是权限与数据的唯一关口**:前端传上来的 id 不可信,必须逐条校验。
    同 project 这一条同时兜住了越权 —— `meeting` 本身已经过 `_load_meeting_owned`
    (含 ACL),而这里要求目标会议与它同项目,所以不可能跨项目读取。
    """
    if not meeting.project_id:
        return None
    other = await session.get(Meeting, prev_id)
    if other is None:
        return None
    if other.id == meeting.id:
        return None
    if other.project_id != meeting.project_id:
        return None
    if other.meeting_minutes is None:
        return None
    return other


async def resolve_prev_meeting(
    meeting: Meeting, prev_id: int | None, session: AsyncSession
) -> tuple[Meeting | None, str | None]:
    """决定这次拿哪一场当对比基准。返回 `(会议, 错误文案)`。

    传了 `prev_id` 就用它(并走 `load_comparable_meeting` 校验);
    没传就退回「上一场」。两条路都失败时给出**可读的中文原因** ——
    这个文案会直接进 400 响应给用户看,不要写成英文或堆栈腔。

    放在服务层而不是 API 层,是因为 api/meeting.py 有两份副本(主树 + overlay),
    逻辑放这里只需维护一处。
    """
    if prev_id is not None:
        prev = await load_comparable_meeting(meeting, prev_id, session)
        if prev is None:
            return None, "所选的对比会议不存在、不属于本项目,或还没出纪要"
        return prev, None

    prev = await find_previous_meeting(meeting, session)
    if prev is None:
        return None, "本项目没有更早的、已出纪要的会议可供对比"
    return prev, None


async def _requirements_of(meeting_id: int, session: AsyncSession) -> list[Requirement]:
    stmt = (
        select(Requirement)
        .where(Requirement.meeting_id == meeting_id)
        .order_by(Requirement.priority.asc(), Requirement.id.asc())
        .limit(_MAX_REQUIREMENTS)
    )
    return list((await session.scalars(stmt)).all())


def _format_requirements(reqs: list[Requirement]) -> str:
    if not reqs:
        return "(本场没有抽取到需求)"
    return "\n".join(
        f"- [{r.req_id}] ({r.priority}) {r.module}: {r.description}"
        + (f" —— 提出人:{r.speaker}" if r.speaker else "")
        for r in reqs
    )


def _excerpt(text: str | None) -> str:
    """转写摘录。复用 revision_learning 的「首 2/3 + 尾」截断,保留结构感。"""
    if not text or not text.strip():
        return "(无转写)"
    from services.revision_learning import _truncate_head_tail

    return _truncate_head_tail(text, _TRANSCRIPT_EXCERPT)


def _transcript_of(m: Meeting) -> str:
    return m.polished_transcript or m.raw_transcript or ""


def _fmt_date(m: Meeting) -> str:
    return m.start_time.strftime("%Y-%m-%d") if m.start_time else "时间未知"


def _dump_minutes(m: Meeting) -> str:
    """纪要已经是结构化 JSON(~2-4KB),直接原样给出 —— 它是最可比的证据。"""
    import json

    if not m.meeting_minutes:
        return "(无纪要)"
    return json.dumps(m.meeting_minutes, ensure_ascii=False, indent=1)


def _ground_changes(changes: list[dict], corpus: str) -> tuple[list[dict], int]:
    """丢掉 evidence 在材料里查无实据的 change。

    软校验,不是硬证明 —— 但足以挡掉「模型凭常识编一条变化」这类最常见的幻觉:
    编出来的 evidence 通常是把常识复述一遍,那些字在材料里根本不存在。
    """
    kept: list[dict] = []
    dropped = 0
    for c in changes:
        evidence = c.get("evidence")
        if not isinstance(evidence, str) or len(evidence.strip()) < _MIN_EVIDENCE_CHARS:
            dropped += 1
            continue
        # 允许模型做轻微的标点/空白调整:按前 24 字做子串匹配
        probe = evidence.strip().replace(" ", "")[:24]
        if probe and probe not in corpus.replace(" ", ""):
            dropped += 1
            continue
        trend = c.get("trend")
        kept.append(
            {
                "dimension": str(c.get("dimension") or "其他")[:8],
                "before": str(c.get("before") or ""),
                "after": str(c.get("after") or ""),
                "trend": trend if trend in _VALID_TRENDS else "无变化",
                "evidence": evidence.strip(),
            }
        )
    return kept, dropped


def _sanitize_suggestions(items: list[dict]) -> list[dict]:
    out: list[dict] = []
    for s in items:
        action = str(s.get("action") or "").strip()
        if not action:
            continue
        priority = s.get("priority")
        out.append(
            {
                "action": action,
                "rationale": str(s.get("rationale") or "").strip(),
                "priority": priority if priority in _VALID_PRIORITIES else "中",
            }
        )
    return out[:5]


async def build_comparison(
    meeting: Meeting, prev: Meeting, session: AsyncSession
) -> dict:
    """跑一次对比,返回可直接写进 `Meeting.comparison_insight` 的 dict(不含 status)。

    不抛业务异常:失败时返回带 `error` 的 dict,由调用方决定怎么记 —— 这个函数在
    Celery 任务里跑,抛出去只会变成一个前端看不懂的 FAILURE。
    """
    import json

    from prompts.meeting import COMPARE_SYSTEM, COMPARE_USER
    from services.llm_json import loads_lenient

    curr_reqs = await _requirements_of(meeting.id, session)
    prev_reqs = await _requirements_of(prev.id, session)

    curr_transcript = _transcript_of(meeting)
    prev_transcript = _transcript_of(prev)
    curr_minutes = _dump_minutes(meeting)
    prev_minutes = _dump_minutes(prev)

    # 两场都没有任何材料 → 不调模型。凭空比只会得到一篇编出来的洞察。
    if curr_minutes == "(无纪要)" and prev_minutes == "(无纪要)" and not curr_transcript and not prev_transcript:
        return {
            "summary": "",
            "changes": [],
            "suggestions": [],
            "error": "两场会议都没有纪要或转写,无法对比",
            "generated_at": _now_iso(),
        }

    project_name = ""
    try:
        if meeting.project_id:
            from models.project import Project

            proj = await session.get(Project, meeting.project_id)
            project_name = getattr(proj, "name", "") or ""
    except Exception:
        # 项目名只是标题里的装饰,取不到不影响对比
        logger.warning("compare_project_name_failed", exc_info=True)

    messages = [
        {"role": "system", "content": COMPARE_SYSTEM},
        {
            "role": "user",
            "content": COMPARE_USER.format(
                project_name=project_name or "(未命名项目)",
                prev_title=prev.title or "(未命名会议)",
                prev_date=_fmt_date(prev),
                prev_minutes=prev_minutes,
                prev_requirements=_format_requirements(prev_reqs),
                prev_transcript=_excerpt(prev_transcript),
                curr_title=meeting.title or "(未命名会议)",
                curr_date=_fmt_date(meeting),
                curr_minutes=curr_minutes,
                curr_requirements=_format_requirements(curr_reqs),
                curr_transcript=_excerpt(curr_transcript),
            ),
        },
    ]

    try:
        content, model_used = await model_router.chat_with_routing(
            task="meeting_compare_insight",
            messages=messages,
            temperature=0.3,
            max_tokens=8000,
            # 缺 validator = JSON 被截断也当成功(LEARNING §11.10 的静默坑)
            validator=_json_output_valid,
            response_format={"type": "json_object"},
            extra_payload={"thinking": {"type": "disabled"}},
        )
    except Exception as e:
        logger.warning("compare_llm_failed", meeting_id=meeting.id, error=str(e)[:200])
        return {
            "summary": "",
            "changes": [],
            "suggestions": [],
            "error": f"模型调用失败:{str(e)[:150]}",
            "generated_at": _now_iso(),
        }

    data = loads_lenient(content, None)
    if not isinstance(data, dict):
        logger.warning("compare_bad_json", raw=(content or "")[:200])
        return {
            "summary": "",
            "changes": [],
            "suggestions": [],
            "error": "模型返回的不是合法 JSON",
            "generated_at": _now_iso(),
        }

    raw_changes = data.get("changes")
    changes_in = [c for c in raw_changes if isinstance(c, dict)] if isinstance(raw_changes, list) else []
    # 取证语料 = 喂给模型的全部材料。用同一份,才能保证「材料里真的有」。
    corpus = "\n".join(
        [curr_minutes, prev_minutes, _format_requirements(curr_reqs), _format_requirements(prev_reqs),
         curr_transcript, prev_transcript]
    )
    changes, dropped = _ground_changes(changes_in, corpus)

    raw_sugg = data.get("suggestions")
    suggestions = _sanitize_suggestions(
        [s for s in raw_sugg if isinstance(s, dict)] if isinstance(raw_sugg, list) else []
    )

    if dropped:
        logger.info("compare_changes_dropped", meeting_id=meeting.id, dropped=dropped, kept=len(changes))

    summary = data.get("summary")
    result = {
        "summary": summary.strip() if isinstance(summary, str) else "",
        "changes": changes,
        "suggestions": suggestions,
        "model": model_used,
        "evidence_dropped": dropped,
        "generated_at": _now_iso(),
    }
    # 一条变化都没留下 + 模型也没给建议 → 说明材料不足以支撑对比,如实说明
    if not changes and not suggestions:
        result["error"] = "模型没有给出可取证的变化(可能两场会议材料差异过小)"
    return result


__all__ = [
    "find_previous_meeting",
    "find_comparable_meetings",
    "load_comparable_meeting",
    "resolve_prev_meeting",
    "build_comparison",
]
