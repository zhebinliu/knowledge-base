"""每日工作台报告 celery task。

- send_daily_report:beat 每天早 9 点(北京)自动跑
- run_daily_report_now:走 admin 端点手动触发用(返回 preview 文本或推群)
"""
from __future__ import annotations

import os
from datetime import date

import structlog

from tasks.convert_task import celery_app, run_async

logger = structlog.get_logger()


DEFAULT_GROUP_CHAT_ID = "0:fs:d7de819b547d41d08e066bb3676f36a8:"
DEFAULT_BOT_USER_ID = "4eec5298-7f82-48ec-b731-adff610314ee"
DEFAULT_AIHUB_LOG_PATH = "/aihub-logs/tap.jsonl"


def _config() -> dict:
    return {
        "group_chat_id": os.getenv("DAILY_REPORT_GROUP_CHAT_ID", DEFAULT_GROUP_CHAT_ID),
        "bot_user_id": os.getenv("DAILY_REPORT_BOT_USER_ID", DEFAULT_BOT_USER_ID),
        "aihub_log_path": os.getenv("AIHUB_LOG_PATH", DEFAULT_AIHUB_LOG_PATH),
    }


async def _build_report_text(day: date, aihub_log_path: str) -> str:
    """采集 → 拼文本。不做发送,方便 preview 端点复用。"""
    # 延迟 import:避免模块加载期就拉 SQLAlchemy 依赖,让 celery 启动更快
    from models import async_session_maker
    from services.daily_report.collector import (
        collect_aihub_stats,
        collect_meeting_summaries,
        collect_workbench_stats,
    )
    from services.daily_report.formatter import format_daily_report

    async with async_session_maker() as session:
        workbench = await collect_workbench_stats(session, day)
        meetings = await collect_meeting_summaries(session, day)

    # aihub 是同步 IO,不用 session
    aihub = collect_aihub_stats(aihub_log_path, day)

    return format_daily_report(day.isoformat(), workbench, meetings, aihub)


async def _send_report_async(day: date, dry_run: bool = False) -> dict:
    from services.daily_report.collector import yesterday_beijing
    from services.qixin_gateway.connection_manager import send_message_for_user

    cfg = _config()
    text = await _build_report_text(day, cfg["aihub_log_path"])
    result: dict = {
        "day": day.isoformat(),
        "chars": len(text),
        "chat_id": cfg["group_chat_id"],
        "bot_user_id": cfg["bot_user_id"],
        "preview": text,
    }
    if dry_run:
        result["sent"] = False
        return result
    try:
        send_result = await send_message_for_user(
            user_id=cfg["bot_user_id"],
            chat_id=cfg["group_chat_id"],
            text=text,
        )
        result["sent"] = True
        result["message_id"] = send_result.get("message_id")
    except Exception as e:
        logger.error("daily_report_send_failed", error=str(e), day=day.isoformat())
        result["sent"] = False
        result["error"] = str(e)
    return result


@celery_app.task(name="send_daily_report", soft_time_limit=120, time_limit=180)
def send_daily_report(day_override: str | None = None) -> dict:
    """beat 触发入口。day_override 可用 admin 端点手动跑历史日。"""
    from services.daily_report.collector import yesterday_beijing
    from datetime import date as _date

    if day_override:
        day = _date.fromisoformat(day_override)
    else:
        day = yesterday_beijing()

    logger.info("daily_report_start", day=day.isoformat())
    result = run_async(_send_report_async(day, dry_run=False))
    logger.info(
        "daily_report_done",
        day=day.isoformat(),
        sent=result.get("sent"),
        chars=result.get("chars"),
        error=result.get("error"),
    )
    return {k: v for k, v in result.items() if k != "preview"}  # 日志里不带全文


@celery_app.task(name="preview_daily_report", soft_time_limit=60)
def preview_daily_report(day_override: str | None = None) -> dict:
    """dry-run:只组装文本,不推群。给 admin preview 端点用。"""
    from services.daily_report.collector import yesterday_beijing
    from datetime import date as _date

    day = _date.fromisoformat(day_override) if day_override else yesterday_beijing()
    return run_async(_send_report_async(day, dry_run=True))
