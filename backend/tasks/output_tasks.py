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


# ── stale bundle reaper(beat,每 300s)─────────────────────────────────────
# 把卡死在 pending/generating 的 bundle 翻成 failed,避免前端永久转圈。
# 卡死成因:① 生成超时被 Celery 硬杀(time_limit 到点杀进程,runner 的 except 来不及跑);
#           ② 部署滚动重启 celery_worker,在途任务被 orphan。
# 翻成 failed 后,前端 inflightByKind 不再命中 → 阶段回到空态(带「生成」按钮)→ 可重试。
# 阈值 60min 远大于最长任务硬限 2100s(35min),不会误杀仍在跑的长任务。
STALE_BUNDLE_MINUTES = 60


@celery_app.task(name="reap_stale_bundles")
def reap_stale_bundles():
    return _run(_reap_stale_bundles())


async def _reap_stale_bundles() -> int:
    from datetime import timedelta
    from sqlalchemy import select
    from models import async_session_maker
    from models.curated_bundle import CuratedBundle
    from services._time import utcnow_naive

    cutoff = utcnow_naive() - timedelta(minutes=STALE_BUNDLE_MINUTES)
    reaped = 0
    async with async_session_maker() as s:
        rows = (await s.execute(
            select(CuratedBundle)
            .where(CuratedBundle.status.in_(("pending", "generating")))
            .where(CuratedBundle.created_at < cutoff)
        )).scalars().all()
        for b in rows:
            b.status = "failed"
            b.error = "生成超时或被中断(后台任务超时 / 服务重启),请重新生成。"
            reaped += 1
        if reaped:
            await s.commit()
    if reaped:
        logger.info("reaped_stale_bundles", count=reaped, cutoff_minutes=STALE_BUNDLE_MINUTES)
    return reaped
