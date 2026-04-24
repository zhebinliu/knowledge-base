from tasks.convert_task import celery_app as app
from tasks import output_tasks  # noqa: F401 — register output generation tasks with Celery
