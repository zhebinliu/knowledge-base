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
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="process_document", bind=True, max_retries=2)
def process_document(self, doc_id: str):
    try:
        run_async(_process_document_async(doc_id))
    except Exception as exc:
        logger.error("process_document_failed", doc_id=doc_id, error=str(exc))
        raise self.retry(exc=exc, countdown=60)


async def _process_document_async(doc_id: str):
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from models.document import Document
    from models.chunk import Chunk
    from models.review_queue import ReviewQueue
    from agents.converter_agent import convert_to_markdown
    from agents.slicer_agent import slice_and_classify
    from services.embedding_service import embedding_service
    from services.vector_store import vector_store
    from minio import Minio
    import io

    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        doc = await session.get(Document, doc_id)
        if not doc:
            logger.error("document_not_found", doc_id=doc_id)
            return

        # 状态：处理中
        doc.conversion_status = "converting"
        await session.commit()

        try:
            # 从 MinIO 下载文件
            minio_client = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_user,
                secret_key=settings.minio_password,
                secure=False,
            )
            response = minio_client.get_object(settings.minio_bucket, doc.file_path)
            content = response.read()

            # 转化为 Markdown
            markdown = await convert_to_markdown(doc.filename, content)
            doc.markdown_content = markdown
            doc.conversion_status = "slicing"
            await session.commit()

            # 切片 + 分类
            slices = await slice_and_classify(markdown, doc.filename)

            # 入库
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

                # 向量入库
                vector = await embedding_service.embed(slice_data["content"])
                await vector_store.upsert(
                    chunk.id,
                    vector,
                    {
                        "chunk_id": chunk.id,
                        "document_id": doc_id,
                        "ltc_stage": slice_data["ltc_stage"],
                        "industry": slice_data["industry"],
                        "content_preview": slice_data["content"][:500],
                    },
                )
                chunk.vector_id = chunk.id

                # 需要人工审核的加入审核队列
                if slice_data["review_status"] == "needs_review":
                    review_item = ReviewQueue(chunk_id=chunk.id, reason="低置信度分类")
                    session.add(review_item)

            doc.conversion_status = "completed"
            await session.commit()
            logger.info("document_processed", doc_id=doc_id, chunks=len(slices))

        except Exception as e:
            doc.conversion_status = "failed"
            await session.commit()
            logger.error("document_processing_error", doc_id=doc_id, error=str(e))
            raise
