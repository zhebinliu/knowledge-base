"""
Celery 异步任务：文档转化 + 切片 + 向量入库
"""

import asyncio
import structlog
from celery import Celery
from config import settings

logger = structlog.get_logger()

celery_app = Celery("kb_tasks", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_expires = 3600


def run_async(coro):
    """
    通用同步运行异步函数包装器。
    使用共享事件循环或新建（视环境而定）。
    """
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(coro)


@celery_app.task(name="process_document", bind=True, max_retries=2)
def process_document(self, doc_id: str):
    try:
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

        # 1. 立即标记为正在处理
        doc.conversion_status = "converting"
        await session.commit()
        logger.info("task_started", doc_id=doc_id, filename=doc.filename)

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
            markdown = await convert_to_markdown(doc.filename, content)
            doc.markdown_content = markdown
            doc.conversion_status = "slicing"
            await session.commit()

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
                )
                session.add(chunk)
                await session.flush()

                # 生成向量并入库
                vector = await embedding_service.embed(slice_data["content"])
                await vector_store.upsert(
                    chunk.id,
                    vector,
                    {
                        "chunk_id": chunk.id,
                        "document_id": doc_id,
                        "ltc_stage": slice_data["ltc_stage"],
                        "industry": slice_data["industry"],
                        "content_preview": slice_data["content"][:200],
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
