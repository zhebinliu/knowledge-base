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
