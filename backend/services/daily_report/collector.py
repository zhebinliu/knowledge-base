"""每日报告数据采集 — KB 工作台 + 会议昨日纪要 + AI Hub。

所有函数都独立无副作用,返回纯 dict/list,给 formatter 拼文本用。
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.document import Document
from models.meeting import Meeting
from models.project import Project
from models.project_todo import ProjectTodo


BEIJING_TZ = timezone(timedelta(hours=8))


def yesterday_beijing() -> date:
    """按北京时区算「昨天」。"""
    return (datetime.now(BEIJING_TZ) - timedelta(days=1)).date()


def _bj_day_range_utc(day: date) -> tuple[datetime, datetime]:
    """给北京时区的某一天,返回该 24h 区间对应的 UTC naive datetime。

    DB 里所有 created_at 都是 naive UTC(见 services/_time.utcnow_naive),
    直接跟这里返回的两个边界比较即可。
    """
    start_bj = datetime.combine(day, datetime.min.time(), BEIJING_TZ)
    end_bj = start_bj + timedelta(days=1)
    return (
        start_bj.astimezone(timezone.utc).replace(tzinfo=None),
        end_bj.astimezone(timezone.utc).replace(tzinfo=None),
    )


# ============================================================
# KB 工作台
# ============================================================


async def collect_workbench_stats(session: AsyncSession, day: date) -> dict:
    """全局工作台统计:累计规模 + 昨日新增 + 待办分布。"""
    day_start, day_end = _bj_day_range_utc(day)

    total_projects = (await session.execute(select(func.count(Project.id)))).scalar_one()
    total_docs = (await session.execute(
        select(func.count(Document.id)).where(Document.conversion_status == "completed")
    )).scalar_one()
    total_meetings = (await session.execute(select(func.count(Meeting.id)))).scalar_one()

    new_projects = (await session.execute(
        select(func.count(Project.id)).where(
            Project.created_at >= day_start, Project.created_at < day_end
        )
    )).scalar_one()
    new_docs = (await session.execute(
        select(func.count(Document.id)).where(
            Document.created_at >= day_start, Document.created_at < day_end
        )
    )).scalar_one()
    new_meetings = (await session.execute(
        select(func.count(Meeting.id)).where(
            Meeting.created_at >= day_start, Meeting.created_at < day_end
        )
    )).scalar_one()

    pending = (await session.execute(
        select(func.count(ProjectTodo.id)).where(ProjectTodo.status == "pending")
    )).scalar_one()
    doing = (await session.execute(
        select(func.count(ProjectTodo.id)).where(ProjectTodo.status == "doing")
    )).scalar_one()
    done_yesterday = (await session.execute(
        select(func.count(ProjectTodo.id)).where(
            ProjectTodo.status == "done",
            ProjectTodo.updated_at >= day_start,
            ProjectTodo.updated_at < day_end,
        )
    )).scalar_one()
    # 过期:due_date < 今天(day+1),状态未 done
    overdue = (await session.execute(
        select(func.count(ProjectTodo.id)).where(
            ProjectTodo.status != "done",
            ProjectTodo.due_date.isnot(None),
            ProjectTodo.due_date < day + timedelta(days=1),
        )
    )).scalar_one()

    return {
        "day": day.isoformat(),
        "total": {
            "projects": total_projects,
            "documents": total_docs,
            "meetings": total_meetings,
        },
        "yesterday_new": {
            "projects": new_projects,
            "documents": new_docs,
            "meetings": new_meetings,
        },
        "todos": {
            "pending": pending,
            "doing": doing,
            "done_yesterday": done_yesterday,
            "overdue": overdue,
        },
    }


# ============================================================
# 会议昨日纪要
# ============================================================


async def collect_meeting_summaries(
    session: AsyncSession, day: date, max_meetings: int = 5
) -> list[dict]:
    """昨日创建且已有纪要的会议 → 每场取 title/summary/关键决策/action 数。"""
    day_start, day_end = _bj_day_range_utc(day)
    rows = (await session.execute(
        select(Meeting).where(
            Meeting.created_at >= day_start,
            Meeting.created_at < day_end,
            Meeting.meeting_minutes.isnot(None),
        ).order_by(Meeting.created_at.desc()).limit(max_meetings)
    )).scalars().all()

    out: list[dict] = []
    for m in rows:
        minutes = m.meeting_minutes or {}
        edited = m.edited_minutes or {}  # 用户编辑过的优先
        summary = (edited.get("summary") or minutes.get("summary") or "").strip()
        decisions_raw = edited.get("decisions") or minutes.get("decisions") or []
        actions = edited.get("action_items") or minutes.get("action_items") or []

        # decisions 元素通常是 dict {content, owner, start_seconds, end_seconds},
        # 也可能是历史遗留的纯字符串 —— 都归一化成 str
        decisions: list[str] = []
        for d in decisions_raw[:3]:
            if isinstance(d, dict):
                content = str(d.get("content") or "").strip()
                owner = str(d.get("owner") or "").strip()
                text = f"{content}({owner})" if owner else content
            else:
                text = str(d).strip()
            if text:
                decisions.append(text[:120])

        out.append({
            "id": m.id,
            "title": m.title or "未命名会议",
            "summary": summary[:200],
            "decisions": decisions,
            "action_items_count": len(actions),
            "project_id": m.project_id,
        })
    return out


# ============================================================
# AI Hub (tap.jsonl)
# ============================================================


_RE_MODEL = re.compile(r'"model"\s*:\s*"([^"]+)"')
_RE_USAGE_TOTAL = re.compile(r'"total_tokens"\s*:\s*(\d+)')
_RE_USAGE_PROMPT = re.compile(r'"prompt_tokens"\s*:\s*(\d+)')
_RE_USAGE_COMPLETION = re.compile(r'"completion_tokens"\s*:\s*(\d+)')


def collect_aihub_stats(
    jsonl_path: str, day: date, max_lines_scan: int = 500_000
) -> dict:
    """从 tap.jsonl 聚合 day(北京日期)当天的 AI Hub 调用情况。

    tap.jsonl 一行结构:{client_ip, duration_ms, method, path, req_body, resp_body, status, ts, ua}
    ts 是 UTC 但业务上按北京日算,所以这里做 UTC→BJ 转换后再匹配 day 前缀。
    """
    p = Path(jsonl_path)
    if not p.exists():
        return _empty_aihub(day, error=f"日志文件不存在: {jsonl_path}")

    # 该 day(BJ)对应 UTC 时间跨度:BJ 00:00-24:00 == UTC 前一天 16:00 - 当天 16:00
    utc_start = (datetime.combine(day, datetime.min.time(), BEIJING_TZ)
                 .astimezone(timezone.utc))
    utc_end = utc_start + timedelta(days=1)
    utc_day_prev = (utc_start.date()).isoformat()   # UTC 前一天前缀
    utc_day_curr = (utc_end.date()).isoformat()     # UTC 当天前缀
    # 用两个前缀快速过滤(strncmp 级别快),再解析 json 精确比对

    total_calls = 0
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens_sum = 0
    model_calls: Counter = Counter()
    model_tokens: dict[str, int] = defaultdict(int)
    error_count = 0
    error_paths: Counter = Counter()
    ip_calls: Counter = Counter()
    ua_calls: Counter = Counter()
    slow_calls = 0

    scanned = 0
    with p.open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            scanned += 1
            if scanned > max_lines_scan:
                break
            # 快速过滤:ts 必须以 utc_day_prev 或 utc_day_curr 开头
            if f'"ts":"{utc_day_prev}' not in line and f'"ts":"{utc_day_curr}' not in line:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue

            # 精确时间过滤:ts 必须落在 [utc_start, utc_end)
            ts_str = d.get("ts") or ""
            try:
                # 兼容 2026-06-30T00:00:00Z 和 2026-06-30T00:00:00.123456789Z
                ts_clean = ts_str.rstrip("Z").split(".")[0]
                ts_dt = datetime.fromisoformat(ts_clean).replace(tzinfo=timezone.utc)
            except Exception:
                continue
            if not (utc_start <= ts_dt < utc_end):
                continue

            total_calls += 1

            rb = d.get("resp_body") or ""
            qb = d.get("req_body") or ""
            m_model = _RE_MODEL.search(rb) or _RE_MODEL.search(qb)
            model = m_model.group(1) if m_model else "(unknown)"
            model_calls[model] += 1

            # 流式响应 usage 在最后一 chunk,取 findall 最后一个
            usage_totals = _RE_USAGE_TOTAL.findall(rb)
            usage_prompts = _RE_USAGE_PROMPT.findall(rb)
            usage_completions = _RE_USAGE_COMPLETION.findall(rb)
            if usage_totals:
                t = int(usage_totals[-1])
                total_tokens_sum += t
                model_tokens[model] += t
            if usage_prompts:
                prompt_tokens += int(usage_prompts[-1])
            if usage_completions:
                completion_tokens += int(usage_completions[-1])

            status = d.get("status") or 0
            if not (200 <= status < 300):
                error_count += 1
                error_paths[d.get("path", "?")] += 1

            ip = (d.get("client_ip") or "").strip() or "-"
            ua = (d.get("ua") or "").strip() or "-"
            ip_calls[ip] += 1
            ua_calls[ua] += 1

            if (d.get("duration_ms") or 0) > 30_000:
                slow_calls += 1

    return {
        "day": day.isoformat(),
        "total_calls": total_calls,
        "total_tokens": {
            "prompt": prompt_tokens,
            "completion": completion_tokens,
            "total": total_tokens_sum,
        },
        "by_model": [
            {"model": m, "calls": c, "tokens": model_tokens.get(m, 0)}
            for m, c in model_calls.most_common(8)
        ],
        "errors": {
            "count": error_count,
            "top_paths": [{"path": pp, "count": c} for pp, c in error_paths.most_common(3)],
        },
        "top_ips": [{"ip": ip, "calls": c} for ip, c in ip_calls.most_common(5)],
        "top_ua": [{"ua": ua[:60], "calls": c} for ua, c in ua_calls.most_common(5)],
        "slow_calls_count": slow_calls,
        "_scanned_lines": scanned,
    }


def _empty_aihub(day: date, error: str | None = None) -> dict:
    out = {
        "day": day.isoformat(),
        "total_calls": 0,
        "total_tokens": {"prompt": 0, "completion": 0, "total": 0},
        "by_model": [],
        "errors": {"count": 0, "top_paths": []},
        "top_ips": [],
        "top_ua": [],
        "slow_calls_count": 0,
    }
    if error:
        out["error"] = error
    return out
