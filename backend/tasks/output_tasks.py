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


@celery_app.task(name="generate_kickoff_pptx", bind=True, max_retries=2)
def generate_kickoff_pptx(self, bundle_id: str, project_id: str):
    from services.output_service import generate_kickoff_pptx as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_kickoff_html", bind=True, max_retries=2)
def generate_kickoff_html(self, bundle_id: str, project_id: str):
    from services.output_service import generate_kickoff_html as _gen
    _run(_gen(bundle_id, project_id))


# ── agentic 生成器(insight / survey / survey_outline) ──────────────────────

@celery_app.task(name="generate_insight", bind=True, max_retries=2)
def generate_insight(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_insight as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_survey", bind=True, max_retries=2)
def generate_survey(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_survey as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_survey_outline", bind=True, max_retries=2)
def generate_survey_outline(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_survey_outline as _gen
    _run(_gen(bundle_id, project_id))
