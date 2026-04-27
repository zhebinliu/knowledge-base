"""Celery tasks for output generation (kickoff_pptx / survey / insight)."""
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


@celery_app.task(name="generate_survey", bind=True, max_retries=2)
def generate_survey(self, bundle_id: str, project_id: str):
    from services.output_service import generate_survey as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_insight", bind=True, max_retries=2)
def generate_insight(self, bundle_id: str, project_id: str):
    from services.output_service import generate_insight as _gen
    _run(_gen(bundle_id, project_id))
