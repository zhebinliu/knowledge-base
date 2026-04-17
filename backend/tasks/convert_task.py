"""
Celery 异步任务：文档转化 + 切片 + 向量入库
"""

import asyncio
import structlog
from celery import Celery
from config import settings

logger = structlog.get_logger()

celery_app = Celery("kb_tasks", broker=settings.redis_url, backend=settings.redis_url)


# Fork 后旧 asyncpg 连接与新事件循环不兼容，必须 dispose 让引擎重建连接
from celery.signals import worker_process_init

@worker_process_init.connect
def reset_db_pool(**kwargs):
    from models import engine
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(engine.dispose())
    finally:
        loop.close()
celery_app.conf.task_serializer = "json"
celery_app.conf.result_expires = 3600
celery_app.conf.beat_schedule = {
    "check-challenge-schedules": {
        "task": "run_scheduled_challenges",
        "schedule": 60.0,  # 每 60 秒检查一次是否该跑
    },
}


def run_async(coro):
    """同步运行异步函数。每次调用创建独立事件循环，避免 Celery 线程冲突。"""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="process_document", bind=True, max_retries=2)
def process_document(self, doc_id: str):
    # 立即更新状态，解决 Pending 问题
    from models import async_session_maker
    from models.document import Document
    
    async def _update_status():
        async with async_session_maker() as session:
            doc = await session.get(Document, doc_id)
            if doc:
                doc.conversion_status = "converting"
                await session.commit()
    
    try:
        run_async(_update_status())
        logger.info("task_received", doc_id=doc_id, task_id=self.request.id)
        run_async(_process_document_async(doc_id))
    except Exception as exc:
        logger.error("process_document_failed", doc_id=doc_id, error=str(exc))
        raise self.retry(exc=exc, countdown=60)


async def _process_document_async(doc_id: str):
    from models import async_session_maker
    from models.document import Document
    from models.chunk import Chunk
    from models.review_queue import ReviewQueue
    from agents.converter_agent import convert_to_markdown
    from agents.slicer_agent import slice_and_classify
    from services.embedding_service import embedding_service
    from services.vector_store import vector_store
    from minio import Minio

    async with async_session_maker() as session:
        doc = await session.get(Document, doc_id)
        if not doc:
            logger.error("document_not_found", doc_id=doc_id)
            return

        # 此处状态已经在同步入口更新过，这里仅作记录
        logger.info("task_processing_start", doc_id=doc_id, filename=doc.filename)

        try:
            # 2. 从 MinIO 获取原始文件
            minio_client = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_user,
                secret_key=settings.minio_password,
                secure=False,
            )
            response = minio_client.get_object(settings.minio_bucket, doc.file_path)
            content = response.read()

            # 3. 文档解析与 Markdown 转化
            markdown, convert_model = await convert_to_markdown(doc.filename, content)
            doc.markdown_content = markdown
            doc.conversion_status = "slicing"
            await session.commit()
            logger.info("conversion_model_used", doc_id=doc_id, model=convert_model)

            # 4. 高级切片与 LTC 分类
            slices = await slice_and_classify(markdown, doc.filename)

            # 5. 结构化入库
            for slice_data in slices:
                chunk = Chunk(
                    document_id=doc_id,
                    content=slice_data["content"],
                    chunk_index=slice_data["chunk_index"],
                    ltc_stage=slice_data["ltc_stage"],
                    ltc_stage_confidence=slice_data["ltc_stage_confidence"],
                    industry=slice_data["industry"],
                    module=slice_data["module"],
                    tags=slice_data["tags"],
                    source_section=slice_data["section_path"],
                    char_count=slice_data["char_count"],
                    review_status=slice_data["review_status"],
                    generated_by_model=slice_data.get("classified_by_model"),
                )
                session.add(chunk)
                await session.flush()

                vector = await embedding_service.embed(slice_data["content"])
                await vector_store.upsert(
                    chunk.id,
                    vector,
                    {
                        "chunk_id": chunk.id,
                        "document_id": doc_id,
                        "ltc_stage": slice_data["ltc_stage"],
                        "industry": slice_data["industry"],
                        "section_path": slice_data.get("section_path", ""),
                        "content_preview": slice_data["content"][:500],
                    },
                )
                chunk.vector_id = chunk.id

                # 低置信度的人工审核入队
                if slice_data["review_status"] == "needs_review":
                    review_item = ReviewQueue(chunk_id=chunk.id, reason="分类置信度低")
                    session.add(review_item)

            # 6. 标记成功
            doc.conversion_status = "completed"
            await session.commit()
            logger.info("task_completed", doc_id=doc_id, total_chunks=len(slices))

        except Exception as inner_exc:
            await session.rollback()
            doc.conversion_status = "failed"
            await session.commit()
            logger.error("task_execution_error", doc_id=doc_id, error=str(inner_exc))
            raise


@celery_app.task(name="run_scheduled_challenges")
def run_scheduled_challenges():
    """每分钟检查 challenge_schedules 表，按 cron 判断是否该执行。"""
    run_async(_check_and_run_schedules())


async def _check_and_run_schedules():
    from datetime import datetime, timedelta, timezone
    from models import async_session_maker
    from models.challenge_schedule import ChallengeSchedule
    from sqlalchemy import select

    try:
        from croniter import croniter
    except ImportError:
        logger.debug("croniter not installed, skipping schedule check")
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    async with async_session_maker() as session:
        result = await session.execute(
            select(ChallengeSchedule).where(ChallengeSchedule.enabled == True)  # noqa: E712
        )
        schedules = result.scalars().all()

        for sched in schedules:
            try:
                cron = croniter(sched.cron_expression, sched.last_run_at or (now - timedelta(days=1)))
                next_run = cron.get_next(datetime)
                if next_run <= now:
                    logger.info("scheduled_challenge_start", schedule_id=sched.id, stages=sched.stages)
                    from agents.challenger_agent import run_challenge_stream
                    async for _event in run_challenge_stream(
                        sched.stages,
                        sched.questions_per_stage,
                        trigger_type="scheduled",
                        triggered_by=sched.id,
                        triggered_by_name=sched.name,
                    ):
                        pass  # 只消费事件，结果已在 agent 内持久化到 KB
                    sched.last_run_at = now
                    await session.commit()
                    logger.info("scheduled_challenge_done", schedule_id=sched.id)
            except Exception as e:
                logger.error("scheduled_challenge_error", schedule_id=sched.id, error=str(e)[:200])
