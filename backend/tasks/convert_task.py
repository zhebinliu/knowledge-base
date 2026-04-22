"""
Celery 异步任务：文档转化 + 切片 + 向量入库
"""

import asyncio
import structlog
from celery import Celery
from config import settings

logger = structlog.get_logger()

celery_app = Celery("kb_tasks", broker=settings.redis_url, backend=settings.redis_url)


# Celery 每个任务都创建新事件循环，asyncpg 连接池会绑定旧循环导致冲突。
# 用 NullPool 完全禁用连接池：每次 async with session 创建新连接，用完即关。
from celery.signals import worker_process_init
from sqlalchemy.pool import NullPool

@worker_process_init.connect
def reset_db_pool_to_nullpool(**kwargs):
    """Worker fork 后替换引擎为 NullPool，避免跨事件循环连接冲突。"""
    import models as _models
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from config import settings

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_models.engine.dispose())
    finally:
        loop.close()

    new_engine = create_async_engine(
        settings.database_url,
        echo=False,
        connect_args={"ssl": False},
        poolclass=NullPool,
    )
    _models.engine = new_engine
    _models.async_session_maker = sessionmaker(
        new_engine, class_=AsyncSession, expire_on_commit=False
    )
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
        # 关闭 loop 前先 dispose 所有异步客户端，避免残留 Future 在下次调用时
        # 报 "attached to a different loop"。包括 asyncpg 引擎、httpx、qdrant 客户端。
        async def _cleanup():
            try:
                from models import engine
                await engine.dispose()
            except Exception:
                pass
            try:
                from services.model_router import model_router
                if model_router._client and not model_router._client.is_closed:
                    await model_router._client.aclose()
                model_router._client = None
            except Exception:
                pass
            try:
                from services.embedding_service import embedding_service
                if embedding_service._client and not embedding_service._client.is_closed:
                    await embedding_service._client.aclose()
                embedding_service._client = None
            except Exception:
                pass
            try:
                from services.vector_store import vector_store
                if vector_store._client:
                    await vector_store._client.close()
                vector_store._client = None
            except Exception:
                pass
        try:
            loop.run_until_complete(_cleanup())
        except Exception:
            pass
        loop.close()


@celery_app.task(name="process_document", bind=True, max_retries=2)
def process_document(self, doc_id: str):
    # 先 import 所有有 FK 关系的模型，确保 SQLAlchemy mapper configure 时能解析 FK
    from models.user import User  # noqa: F401
    from models.project import Project  # noqa: F401
    from models.challenge_run import ChallengeRun  # noqa: F401
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
    from models.user import User  # noqa: F401 — FK documents.uploader_id→users.id
    from models.project import Project  # noqa: F401 — FK documents.project_id→projects.id
    from models.document import Document
    from models.chunk import Chunk
    from models.review_queue import ReviewQueue
    from agents.converter_agent import convert_to_markdown
    from agents.slicer_agent import slice_and_classify
    from services.embedding_service import embedding_service
    from services.vector_store import vector_store
    from services.config_service import config_service
    from services.model_router import model_router
    from minio import Minio

    model_router.set_config_service(config_service)

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
                        "doc_industry": doc.industry or "",
                        "section_path": slice_data.get("section_path", ""),
                        "content_preview": slice_data["content"][:500],
                    },
                )
                chunk.vector_id = chunk.id

                # 低置信度的人工审核入队
                if slice_data["review_status"] == "needs_review":
                    conf = slice_data.get("ltc_stage_confidence", 0)
                    reasoning = slice_data.get("reasoning", "")
                    reason = f"置信度 {conf:.0%}"
                    if reasoning:
                        reason += f"：{reasoning}"
                    review_item = ReviewQueue(chunk_id=chunk.id, reason=reason[:200])
                    session.add(review_item)

            # 6. 自动更新项目模块标签（收集本次文档的模块，合并到项目 modules 字段）
            if doc.project_id and slices:
                new_modules = {
                    s["module"] for s in slices
                    if s.get("module") and s["module"].strip()
                }
                if new_modules:
                    project = await session.get(Project, doc.project_id)
                    if project:
                        existing = set(project.modules or [])
                        merged = sorted(existing | new_modules)
                        if merged != sorted(existing):
                            project.modules = merged
                            logger.info(
                                "project_modules_updated",
                                project_id=doc.project_id,
                                added=sorted(new_modules - existing),
                            )

            # 7. 标记成功
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
    from services.config_service import config_service
    from services.model_router import model_router
    from sqlalchemy import select

    model_router.set_config_service(config_service)

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
