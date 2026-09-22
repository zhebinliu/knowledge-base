"""会议洞察相关的 Celery 任务(2026-09):待办四象限分类 / 跨会议对比。

**只建在 `backend/tasks/` 这一份。** 不要在 `meeting/backend/tasks/` 建同名副本 ——
`meeting/backend/tasks/` 下已有 `meeting_tasks.py` 会覆盖同名文件,一旦建了就会静默漂移
(名词校正词典就是这么失效的,见 LEARNING.md)。新文件只放一处、由 overlay 合并进 /app 即可。

本文件与 `meeting_tasks.py` 的分工:
- `meeting_tasks.py` 是老文件、overlay 有两份、必须逐字同步 → 不再往里加东西
- 本文件是新增文件、只有一份 → 新任务都放这里

两个任务都从干净 fork 触发(由 API 端点 dispatch,可能抢在任何 convert 任务之前跑),
因此都要 wire `model_router.set_config_service`,否则模型解析落代码默认端点
(edgefn)→ 403(LEARNING §24.1 实录)。
"""
import asyncio

import structlog
from tasks.convert_task import celery_app

logger = structlog.get_logger()


def _run(coro):
    """每次新建 event loop —— Celery prefork 下 loop 不能跨任务复用(LEARNING §11.9)。"""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="classify_project_todos_quadrant",
    bind=True,
    track_started=True,
    max_retries=1,
    soft_time_limit=300,
    time_limit=360,
)
def classify_project_todos_quadrant(
    self, project_id: str, only_unclassified: bool = True, ids: list[int] | None = None
):
    """项目待办四象限分类(异步)。返回 classify_todos_quadrant() 的结果 dict。

    同步端点里也会**直接** await 同一个函数(用户手动点「重新分类」时想要即时反馈);
    这个任务只服务于「同步待办后自动分类新增项」—— 那条路径不该让用户等 LLM。
    """
    from api.project_todos import classify_todos_quadrant
    from models import async_session_maker
    from services.config_service import config_service
    from services.model_router import model_router

    model_router.set_config_service(config_service)

    async def _go():
        async with async_session_maker() as session:
            return await classify_todos_quadrant(
                project_id,
                session,
                only_unclassified=only_unclassified,
                ids=ids,
            )

    try:
        return _run(_go())
    except Exception as e:  # noqa: BLE001
        # 分类失败不该影响待办本身 —— 待办已同步成功,只是没象限,前端会显示在「未分类」
        logger.warning(
            "classify_quadrant_task_failed",
            project_id=project_id,
            error=str(e)[:200],
            exc_info=True,
        )
        return {"updated": 0, "error": str(e)[:200]}


@celery_app.task(
    name="compare_meeting_previous",
    bind=True,
    track_started=True,
    max_retries=1,
    soft_time_limit=900,
    time_limit=1200,
)
def compare_meeting_previous(self, meeting_id: int):
    """把本场会议与项目上一场会议横向对比,结果写回 `Meeting.comparison_insight`。

    为什么必须异步:要喂两场的纪要与转写摘录,单次 LLM 调用几十秒到两分钟,同步端点会 504。
    前端 POST 拿到 task_id 后轮询;任务自己把结果落库,前端拿到 SUCCESS 后 invalidate 会议详情。
    """
    from models import async_session_maker
    from models.meeting import Meeting
    from services._time import iso_utc, utcnow_naive
    from services.config_service import config_service
    from services.meeting.comparison import build_comparison, find_previous_meeting
    from services.model_router import model_router

    model_router.set_config_service(config_service)

    def _now():
        return iso_utc(utcnow_naive()) or ""

    async def _go():
        async with async_session_maker() as session:
            m = await session.get(Meeting, meeting_id)
            if not m:
                return {"ok": False, "error": "会议不存在"}

            prev = await find_previous_meeting(m, session)
            if not prev:
                # 首场会议 / 上一场还没出纪要:如实记下来,前端据此显示提示而不是空面板
                m.comparison_insight = {
                    "status": "failed",
                    "prev_meeting_id": None,
                    "prev_meeting_title": None,
                    "prev_meeting_date": None,
                    "summary": "",
                    "changes": [],
                    "suggestions": [],
                    "error": "本项目没有更早的、已出纪要的会议可供对比",
                    "generated_at": _now(),
                }
                await session.commit()
                return {"ok": False, "error": "没有可对比的上一场会议"}

            # 先把 running + 上一场信息落库,让前端轮询期间也能显示「正在和谁比」
            m.comparison_insight = {
                "status": "running",
                "prev_meeting_id": prev.id,
                "prev_meeting_title": prev.title,
                "prev_meeting_date": prev.start_time.strftime("%Y-%m-%d") if prev.start_time else None,
                "summary": "",
                "changes": [],
                "suggestions": [],
                "generated_at": _now(),
            }
            await session.commit()

            result = await build_comparison(m, prev, session)
            # JSON 列原地改字段不会被 SQLAlchemy 认出来,必须整体赋新对象
            m.comparison_insight = {
                "status": "failed" if result.get("error") else "done",
                "prev_meeting_id": prev.id,
                "prev_meeting_title": prev.title,
                "prev_meeting_date": prev.start_time.strftime("%Y-%m-%d") if prev.start_time else None,
                **result,
            }
            await session.commit()
            return {
                "ok": not result.get("error"),
                "prev_meeting_id": prev.id,
                "changes": len(result.get("changes") or []),
                "error": result.get("error"),
            }

    try:
        return _run(_go())
    except Exception as e:  # noqa: BLE001
        logger.warning("compare_meeting_failed", meeting_id=meeting_id, error=str(e)[:200], exc_info=True)
        # 尽力把失败写回,否则前端会一直停在「生成中」
        try:
            async def _mark_failed():
                async with async_session_maker() as s:
                    mm = await s.get(Meeting, meeting_id)
                    if mm:
                        mm.comparison_insight = {
                            "status": "failed",
                            "prev_meeting_id": None,
                            "prev_meeting_title": None,
                            "prev_meeting_date": None,
                            "summary": "",
                            "changes": [],
                            "suggestions": [],
                            "error": str(e)[:200],
                            "generated_at": _now(),
                        }
                        await s.commit()

            _run(_mark_failed())
        except Exception:  # noqa: BLE001
            logger.warning("compare_meeting_mark_failed_failed", meeting_id=meeting_id, exc_info=True)
        return {"ok": False, "error": str(e)[:200]}
