"""Celery tasks for output generation (kickoff_pptx / kickoff_html / insight / survey / survey_outline).

注：insight / survey / survey_outline 三个 task 都走 agentic runner —
旧的对话式 'insight' / 'survey' generator 已下线（v3 命名归一，详见 scripts/migrate_v3_rename.py）。
"""
import asyncio
import structlog
from tasks.convert_task import celery_app

logger = structlog.get_logger()


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="generate_kickoff_pptx", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_kickoff_pptx(self, bundle_id: str, project_id: str):
    from services.output_service import generate_kickoff_pptx as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_kickoff_html", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_kickoff_html(self, bundle_id: str, project_id: str):
    from services.output_service import generate_kickoff_html as _gen
    _run(_gen(bundle_id, project_id))


# ── agentic 生成器(insight / survey / survey_outline) ──────────────────────

@celery_app.task(name="generate_insight", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_insight(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_insight as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_survey", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_survey(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_survey as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_survey_role", bind=True, max_retries=2, soft_time_limit=600, time_limit=900)
def generate_survey_role(self, bundle_id: str, project_id: str, role: str):
    """按单个角色增量生成调研问卷题目(executive / dept_head / frontline / it)。
    参见 services/agentic/runner.generate_survey_for_role。
    """
    from services.agentic.runner import generate_survey_for_role as _gen
    _run(_gen(bundle_id, project_id, role))


@celery_app.task(name="generate_survey_outline", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_survey_outline(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_survey_outline as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_research_report", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_research_report(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_research_report as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_blueprint_design", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_blueprint_design(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_blueprint_design as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_implementation_plan", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_implementation_plan(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_implementation_plan as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_test_plan", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_test_plan(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_test_plan as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_acceptance_report", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_acceptance_report(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_acceptance_report as _gen
    _run(_gen(bundle_id, project_id))


# 对象字段表 / 流程建设表的内部 LLM 预算更大(主调用 720s + linter 2×600s ≈ 最坏 1920s),
# 必须给足 Celery 时间预算,否则跑 linter 时被硬杀 → bundle 永停 generating(详见 reap_stale_bundles)。
@celery_app.task(name="generate_object_field_layout", bind=True, max_retries=2, soft_time_limit=1800, time_limit=2100)
def generate_object_field_layout(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_object_field_layout as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_process_setup", bind=True, max_retries=2, soft_time_limit=1800, time_limit=2100)
def generate_process_setup(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_process_setup as _gen
    _run(_gen(bundle_id, project_id))


# ── kind → 生成任务 映射(供自动重启复用)──────────────────────────────────
def _kind_to_task() -> dict:
    """bundle.kind → 对应的 Celery 生成任务,用于卡死后自动重新触发。
    必须覆盖所有走 curated_bundles 的 kind(与 outputs.api 的 KIND_TO_TASK 对齐)。"""
    return {
        "kickoff_pptx": generate_kickoff_pptx,
        "kickoff_html": generate_kickoff_html,
        "insight": generate_insight,
        "survey": generate_survey,
        "survey_outline": generate_survey_outline,
        "research_report": generate_research_report,
        "blueprint_design": generate_blueprint_design,
        "object_field_layout": generate_object_field_layout,
        "process_setup": generate_process_setup,
        "implementation_plan": generate_implementation_plan,
        "test_plan": generate_test_plan,
        "acceptance_report": generate_acceptance_report,
    }


# ── stale bundle 自动重启(beat 每 300s + 服务启动时各跑一次)──────────────────
# 卡死成因:① 生成被 Celery time_limit 硬杀(runner 的 except 来不及跑);
#           ② 部署滚动重启 celery_worker / backend,在途任务被 orphan。
# 「默认重启工作」机制:对卡死的 bundle 自动重新派发生成任务(沿用文档 process_document
#   的 requeue 思路),最多 MAX_AUTO_RESTARTS 次;超过则标 failed,前端回到空态可手动重试。
# 阈值用 updated_at(生成过程会持续写 progress 刷新 updated_at),单步最大间隔 ~12min(主 LLM 调用),
#   30min 阈值不会误杀仍在跑的任务,又比硬限 35min 后的 orphan 早点捞回来。
STALE_BUNDLE_MINUTES = 30
MAX_AUTO_RESTARTS = 3


@celery_app.task(name="recover_stale_bundles")
def recover_stale_bundles():
    return _run(_recover_stale_bundles())


async def _recover_stale_bundles(cutoff_minutes: int = STALE_BUNDLE_MINUTES,
                                 max_restarts: int = MAX_AUTO_RESTARTS) -> dict:
    """捞出卡死的 bundle:未超重启上限的自动重新派发任务,超限的标 failed。

    返回 {"restarted": n, "failed": m}。派发在 commit 之后做,确保 DB 状态先落库。
    """
    from datetime import timedelta
    from sqlalchemy import select
    from sqlalchemy.orm.attributes import flag_modified
    from models import async_session_maker
    from models.curated_bundle import CuratedBundle
    from services._time import utcnow_naive

    cutoff = utcnow_naive() - timedelta(minutes=cutoff_minutes)
    task_map = _kind_to_task()
    to_dispatch: list[tuple] = []   # (kind, bundle_id, project_id)
    restarted = failed = 0
    async with async_session_maker() as s:
        rows = (await s.execute(
            select(CuratedBundle)
            .where(CuratedBundle.status.in_(("pending", "generating")))
            .where(CuratedBundle.updated_at < cutoff)
        )).scalars().all()
        for b in rows:
            extra = dict(b.extra or {})
            count = int(extra.get("auto_restart_count", 0) or 0)
            can_restart = task_map.get(b.kind) is not None and b.project_id and count < max_restarts
            if can_restart:
                extra["auto_restart_count"] = count + 1
                extra["progress"] = {"stage": "pending", "message": f"任务中断,正在自动重启(第 {count + 1} 次)…"}
                b.extra = extra
                flag_modified(b, "extra")
                b.status = "pending"
                b.error = None
                to_dispatch.append((b.kind, b.id, b.project_id))
                restarted += 1
            else:
                extra["auto_restart_exhausted"] = True
                b.extra = extra
                flag_modified(b, "extra")
                b.status = "failed"
                b.error = ("多次自动重启仍未完成,请手动重新生成或检查素材/服务。"
                           if count >= max_restarts else
                           "生成任务中断且无法自动重启,请手动重新生成。")
                failed += 1
        if rows:
            await s.commit()
    # commit 后再派发(确保 worker 拿到的是已落库的 pending 状态)
    for kind, bid, pid in to_dispatch:
        task = task_map.get(kind)
        if task is not None:
            task.delay(bid, pid)
    if restarted or failed:
        logger.warning("recover_stale_bundles", restarted=restarted, failed=failed,
                       cutoff_minutes=cutoff_minutes)
    return {"restarted": restarted, "failed": failed}
