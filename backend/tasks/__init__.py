from tasks.convert_task import celery_app as app
from tasks import output_tasks  # noqa: F401 — register output generation tasks with Celery
from tasks import meeting_tasks  # noqa: F401 — register meeting AI pipeline tasks

# 2026-05-12:Celery worker 启动时统一注册所有 SQLAlchemy model 元数据。
# 不全量注册会导致跨表 ForeignKey 解析失败 —— 例如 meetings.project_id → projects.id
# 在 transcribe_meeting 里 commit 时 NoReferencedTableError(已撞过)。
# 跟 main.py startup 那段保持一致,免得遗漏。
from models import (  # noqa: F401
    user, project, document, chunk, challenge, review_queue,
    challenge_schedule, agent_config, challenge_run, qa_log,
    coverage_gap, skill, api_call_log, curated_bundle,
    output_conversation, project_brief, challenge_round,
    research_response, research_ltc_module_map, invite_code,
    captcha_challenge, project_collaborator, meeting,
)
