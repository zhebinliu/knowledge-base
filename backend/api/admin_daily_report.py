"""Admin 端点:每日工作台报告手动触发(preview / send-now)。

- POST /api/admin/daily-report/preview  → 组装文本预览,不推群
- POST /api/admin/daily-report/send-now → 立刻推群(用于首次上线校验)

日报正式触发走 celery beat(每天北京 9:00),见 tasks/daily_report_task.py。
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from services.auth import require_admin

router = APIRouter(dependencies=[Depends(require_admin)])


def _parse_day(day: str | None) -> date:
    """day 参数解析:空 → 昨日北京;否则 YYYY-MM-DD。"""
    from services.daily_report.collector import yesterday_beijing

    if not day:
        return yesterday_beijing()
    try:
        return date.fromisoformat(day)
    except ValueError:
        raise HTTPException(status_code=400, detail="day 需为 YYYY-MM-DD 格式")


@router.post("/preview")
async def preview_daily_report(day: str | None = Query(None)):
    """dry-run:组装文本,不推群。返回 {day, chars, preview, chat_id, bot_user_id}。"""
    from tasks.daily_report_task import _send_report_async  # 直接跑 async,不经过 celery

    target = _parse_day(day)
    result = await _send_report_async(target, dry_run=True)
    return result


@router.post("/send-now")
async def send_daily_report_now(day: str | None = Query(None)):
    """立刻推群。返回 {day, sent, message_id?, error?, preview, ...}。"""
    from tasks.daily_report_task import _send_report_async

    target = _parse_day(day)
    result = await _send_report_async(target, dry_run=False)
    if not result.get("sent"):
        raise HTTPException(status_code=500, detail=result)
    return result
