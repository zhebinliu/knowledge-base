"""
Celery 异步任务：文档转化 + 切片 + 向量入库
"""

import asyncio
import time
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
                # Redis 客户端也绑定事件循环，必须同步清理
                if embedding_service._redis is not None:
                    try:
                        await embedding_service._redis.aclose()
                    except Exception:
                        pass
                    embedding_service._redis = None
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


@celery_app.task(name="process_document", bind=True, max_retries=5)
def process_document(self, doc_id: str):
    # 先 import 所有有 FK 关系的模型，确保 SQLAlchemy mapper configure 时能解析 FK
    from models.user import User  # noqa: F401
    from models.project import Project  # noqa: F401
    from models.challenge_run import ChallengeRun  # noqa: F401
    from models import async_session_maker
    from models.document import Document

    async def _update_status(status: str, error: str | None = None):
        async with async_session_maker() as session:
            doc = await session.get(Document, doc_id)
            if doc:
                doc.conversion_status = status
                if error is not None:
                    doc.conversion_error = error
                elif status in ("converting", "slicing", "completed"):
                    # 进入正常态时清掉历史错误
                    doc.conversion_error = None
                await session.commit()

    try:
        run_async(_update_status("converting"))
        logger.info("task_received", doc_id=doc_id, task_id=self.request.id, attempt=self.request.retries + 1)
        run_async(_process_document_async(doc_id))
    except Exception as exc:
        err_msg = (str(exc)[:500] or type(exc).__name__)
        logger.error("process_document_failed", doc_id=doc_id, error=err_msg[:200])
        # 指数退避: 60s, 120s, 240s, 480s, 900s — 给 edgefn rate limit 恢复时间
        countdowns = [60, 120, 240, 480, 900]
        retries_done = self.request.retries
        if retries_done < self.max_retries:
            # 还会重试 → 标记 retrying 而不是 failed，避免 UI 误报
            run_async(_update_status("retrying"))
            wait = countdowns[min(retries_done, len(countdowns) - 1)]
            raise self.retry(exc=exc, countdown=wait)
        # 重试用尽 → 永久失败，写入错误原因供前端展示
        run_async(_update_status("failed", error=err_msg))
        raise


_SUMMARY_FAQ_PROMPT = """你是企业知识库文档分析助手。根据以下文档内容，生成简洁的文档摘要和常见问题。

文件名：{filename}
文档内容（部分）：
{content}

要求：
1. 用 3 句话概括文档核心内容，聚焦最重要的业务价值和关键信息
2. 提炼 5 个读者最可能提问的问题及简洁答案

只输出如下 JSON，不加任何其他文字：
{{"summary":"<3句话摘要，用句号分隔>","faq":[{{"q":"<问题>","a":"<答案>"}}，...（共5条）]}}"""


async def _generate_summary_faq(doc_id: str, filename: str, markdown: str):
    """生成文档摘要和 FAQ，写回 DB；失败不阻断主流程。"""
    import json, re
    from models import async_session_maker
    from models.document import Document
    from services.model_router import model_router
    from services.config_service import config_service

    model_router.set_config_service(config_service)
    content = markdown[:8000]
    prompt = _SUMMARY_FAQ_PROMPT.format(filename=filename, content=content)
    try:
        resp, _ = await model_router.chat_with_routing(
            "doc_generation",
            [{"role": "user", "content": prompt}],
            max_tokens=1500,
            temperature=0.3,
            timeout=60.0,
        )
        if not resp or not resp.strip():
            raise ValueError("empty response")
        raw = resp.strip()
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            raw = m.group()
        data = json.loads(raw)
        summary = (data.get("summary") or "").strip()
        faq = data.get("faq") or []
        if not summary:
            raise ValueError("no summary in response")
        async with async_session_maker() as session:
            doc = await session.get(Document, doc_id)
            if doc:
                doc.summary = summary
                doc.faq = faq if isinstance(faq, list) else []
                await session.commit()
        logger.info("doc_summary_generated", doc_id=doc_id, faq_count=len(faq))
    except Exception as e:
        logger.warning("doc_summary_failed", doc_id=doc_id, error=str(e)[:120])


_DOC_TYPE_PROMPT = """你是文档分类助手。根据文件名和正文摘要，从以下枚举中选择最匹配的文档类型。

可选类型：
- requirement_research：需求调研（客户访谈、需求分析、痛点梳理）
- meeting_notes：会议纪要（会议记录、讨论结果、决议事项）
- solution_design：方案设计（系统架构、实施方案、技术规格、功能说明）
- test_case：测试用例（测试脚本、验收标准、测试步骤）
- user_manual：用户手册（操作指南、用户培训、功能介绍）

文件名：{filename}
正文摘要：{preview}

只输出如下 JSON，不加任何其他文字：
{{"doc_type":"<枚举值>","confidence":<0.0-1.0>,"reason":"<一句话>"}}"""


async def _infer_doc_type(filename: str, markdown: str, model_router) -> tuple[str | None, float]:
    """推断文档类型，返回 (doc_type, confidence)；无法判断时返回 (None, 0)。"""
    import json, re
    from models.project import DOC_TYPES
    preview = markdown[:2000]
    prompt = _DOC_TYPE_PROMPT.format(filename=filename, preview=preview)
    try:
        content, _ = await model_router.chat_with_routing(
            "slicing_classification",
            [{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.0,
            timeout=30.0,
        )
        if not content or not content.strip():
            raise ValueError("empty model response")
        raw = content.strip()
        # 优先用 regex 从任意位置提取 JSON 对象（处理模型返回多余文字/拒答的情况）
        m = re.search(r'\{[^{}]*"doc_type"[^{}]*\}', raw, re.DOTALL)
        if m:
            raw = m.group()
        elif "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        else:
            raise ValueError(f"no JSON in response: {raw[:60]!r}")
        data = json.loads(raw)
        dt = data.get("doc_type", "").strip()
        conf = float(data.get("confidence", 0))
        if dt in DOC_TYPES:
            return dt, conf
    except Exception as e:
        logger.warning("doc_type_inference_failed", filename=filename, error=str(e)[:100])
    return None, 0.0


async def _infer_doc_types_batch_async():
    """对所有 completed 但 doc_type 为空的文档批量补推断类型。"""
    from models import async_session_maker
    from models.document import Document
    from services.config_service import config_service
    from services.model_router import model_router
    from sqlalchemy import select, or_

    model_router.set_config_service(config_service)

    async with async_session_maker() as session:
        result = await session.execute(
            select(Document).where(
                Document.conversion_status == "completed",
                or_(Document.doc_type == None, Document.doc_type == ""),  # noqa: E711
                Document.markdown_content != None,  # noqa: E711
            )
        )
        docs = result.scalars().all()
        logger.info("batch_infer_doc_type_start", total=len(docs))
        updated = 0
        for doc in docs:
            if not doc.markdown_content:
                continue
            inferred_type, confidence = await _infer_doc_type(
                doc.filename, doc.markdown_content, model_router
            )
            if inferred_type and confidence >= 0.5:
                doc.doc_type = inferred_type
                updated += 1
                logger.info(
                    "doc_type_batch_inferred",
                    doc_id=doc.id,
                    filename=doc.filename,
                    doc_type=inferred_type,
                    confidence=f"{confidence:.0%}",
                )
            await asyncio.sleep(0.5)   # 避免过快打 429
        await session.commit()
        logger.info("batch_infer_doc_type_done", updated=updated, total=len(docs))


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
    from sqlalchemy import select, delete as sa_delete

    model_router.set_config_service(config_service)

    async with async_session_maker() as session:
        doc = await session.get(Document, doc_id)
        if not doc:
            logger.error("document_not_found", doc_id=doc_id)
            return

        # 此处状态已经在同步入口更新过，这里仅作记录
        logger.info("task_processing_start", doc_id=doc_id, filename=doc.filename)

        try:
            # 1b. 清理旧切片，防止重处理时产生重复数据
            existing_ids = (await session.execute(
                select(Chunk.id).where(Chunk.document_id == doc_id)
            )).scalars().all()
            if existing_ids:
                await session.execute(
                    sa_delete(Chunk).where(Chunk.document_id == doc_id)
                )
                await session.commit()
                try:
                    await vector_store.delete_by_document(doc_id)
                except Exception as ve:
                    logger.warning("qdrant_cleanup_failed", doc_id=doc_id, error=str(ve)[:80])
                logger.info("existing_chunks_cleared", doc_id=doc_id, count=len(existing_ids))

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
            _t_convert_start = time.time()
            markdown, convert_model = await convert_to_markdown(doc.filename, content)
            _convert_elapsed = time.time() - _t_convert_start
            doc.markdown_content = markdown
            doc.conversion_status = "slicing"
            doc.convert_duration_s = round(_convert_elapsed, 2)
            logger.info(
                "conversion_done",
                doc_id=doc_id,
                model=convert_model,
                chars=len(markdown or ""),
                duration_s=round(_convert_elapsed, 2),
            )

            # 3b. 自动推断文档类型（仅在用户未手动设置时）
            if not doc.doc_type:
                inferred_type, confidence = await _infer_doc_type(doc.filename, markdown, model_router)
                if inferred_type and confidence >= 0.5:
                    doc.doc_type = inferred_type
                    logger.info(
                        "doc_type_inferred",
                        doc_id=doc_id,
                        doc_type=inferred_type,
                        confidence=f"{confidence:.0%}",
                    )

            await session.commit()

            # 4. 高级切片与 LTC 分类
            _t_slice_start = time.time()
            slices = await slice_and_classify(markdown, doc.filename)
            _slice_elapsed = time.time() - _t_slice_start
            doc.slice_duration_s = round(_slice_elapsed, 2)
            logger.info(
                "slicing_done",
                doc_id=doc_id,
                chunks=len(slices),
                duration_s=round(_slice_elapsed, 2),
            )

            # 5. 结构化入库
            _t_embed_start = time.time()
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
                        "review_status": slice_data["review_status"],
                        "ltc_stage_confidence": slice_data.get("ltc_stage_confidence", 0.0),
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

            # 嵌入循环总耗时
            _embed_elapsed = time.time() - _t_embed_start
            doc.embed_duration_s = round(_embed_elapsed, 2)
            logger.info(
                "embedding_done",
                doc_id=doc_id,
                chunks=len(slices),
                duration_s=round(_embed_elapsed, 2),
            )

            # 7. 标记成功
            doc.conversion_status = "completed"
            await session.commit()
            logger.info(
                "task_completed",
                doc_id=doc_id,
                total_chunks=len(slices),
                convert_s=doc.convert_duration_s,
                slice_s=doc.slice_duration_s,
                embed_s=doc.embed_duration_s,
                total_s=round((doc.convert_duration_s or 0) + (doc.slice_duration_s or 0) + (doc.embed_duration_s or 0), 2),
            )

            # 8. 异步生成摘要 + FAQ（失败不影响主流程）
            await _generate_summary_faq(doc_id, doc.filename, markdown)

        except Exception as inner_exc:
            await session.rollback()
            # 不在此处标记 failed —— 让外层 Celery task 决定是 retrying 还是 failed
            logger.error("task_execution_error", doc_id=doc_id, error=str(inner_exc))
            raise


@celery_app.task(name="infer_doc_types_batch")
def infer_doc_types_batch():
    """批量补推断文档类型（对 completed 且 doc_type 为空的文档）。"""
    run_async(_infer_doc_types_batch_async())


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
                        question_mode=getattr(sched, "question_mode", "kb_based"),
                    ):
                        pass  # 只消费事件，结果已在 agent 内持久化到 KB
                    sched.last_run_at = now
                    await session.commit()
                    logger.info("scheduled_challenge_done", schedule_id=sched.id)
            except Exception as e:
                logger.error("scheduled_challenge_error", schedule_id=sched.id, error=str(e)[:200])
