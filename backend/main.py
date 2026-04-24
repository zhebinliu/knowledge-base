from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import settings
from api import documents, chunks, qa, challenge, review, export, agent_settings, auth, projects, users, mcp
from services.rate_limit import limiter
from services.vector_store import vector_store

logger = structlog.get_logger()

app = FastAPI(
    title="KB System API",
    description="纷享销客 CRM 知识库管理系统",
    version="1.0.0",
)

# 限流：SlowAPI 需绑定到 app.state + 注册 429 处理器
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(chunks.router, prefix="/api/chunks", tags=["chunks"])
app.include_router(qa.router, prefix="/api/qa", tags=["qa"])
app.include_router(challenge.router, prefix="/api/challenge", tags=["challenge"])
app.include_router(review.router, prefix="/api/review", tags=["review"])
app.include_router(export.router, prefix="/api/transfer", tags=["transfer"])
app.include_router(agent_settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(mcp.router,   prefix="/api/mcp",   tags=["mcp"])


@app.on_event("startup")
async def startup():
    logger.info("Starting KB System...")
    # 自动建表（幂等，生产环境安全）
    from models import Base, engine as db_engine
    from models.document import Document  # noqa: F401 — side-effect import
    from models.chunk import Chunk  # noqa: F401
    from models.challenge import Challenge  # noqa: F401
    from models.review_queue import ReviewQueue  # noqa: F401
    from models.challenge_schedule import ChallengeSchedule  # noqa: F401
    from models.agent_config import AgentConfig  # noqa: F401
    from models.user import User  # noqa: F401
    from models.project import Project  # noqa: F401
    from models.challenge_run import ChallengeRun  # noqa: F401
    from models.qa_log import Conversation, QuestionLog, AnswerFeedback  # noqa: F401
    from sqlalchemy import text
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # 建索引（幂等）
        for stmt in [
            "CREATE INDEX IF NOT EXISTS idx_chunks_ltc ON chunks(ltc_stage)",
            "CREATE INDEX IF NOT EXISTS idx_chunks_industry ON chunks(industry)",
            "CREATE INDEX IF NOT EXISTS idx_chunks_review ON chunks(review_status)",
            "CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id)",
        ]:
            await conn.execute(text(stmt))
        # 轻量迁移（幂等）：在不破坏老数据的前提下补字段
        for migration in [
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploader_id VARCHAR(36) REFERENCES users(id)",
            "CREATE INDEX IF NOT EXISTS idx_documents_uploader ON documents(uploader_id)",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_id VARCHAR(36) REFERENCES projects(id)",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type VARCHAR(40)",
            "CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id)",
            "CREATE INDEX IF NOT EXISTS idx_documents_doctype ON documents(doc_type)",
            "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS batch_id VARCHAR(36)",
            "CREATE INDEX IF NOT EXISTS idx_chunks_batch ON chunks(batch_id)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS mcp_api_key VARCHAR(64) UNIQUE",
            "ALTER TABLE projects ADD COLUMN IF NOT EXISTS industry VARCHAR(50)",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS industry VARCHAR(50)",
            "CREATE INDEX IF NOT EXISTS idx_documents_industry ON documents(industry)",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS conversion_error TEXT",
            "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS citation_count INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS last_cited_at TIMESTAMP NULL",
            "CREATE INDEX IF NOT EXISTS idx_chunks_citation ON chunks(citation_count DESC, last_cited_at DESC)",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary TEXT",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS faq JSON",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS api_enabled BOOLEAN NOT NULL DEFAULT FALSE",
            "UPDATE users SET api_enabled = TRUE WHERE is_admin = TRUE",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS convert_duration_s DOUBLE PRECISION",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS slice_duration_s DOUBLE PRECISION",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS embed_duration_s DOUBLE PRECISION",
            "ALTER TABLE challenge_runs ADD COLUMN IF NOT EXISTS question_mode VARCHAR(20) NOT NULL DEFAULT 'kb_based'",
            "ALTER TABLE challenge_schedules ADD COLUMN IF NOT EXISTS question_mode VARCHAR(20) NOT NULL DEFAULT 'kb_based'",
        ]:
            await conn.execute(text(migration))
    logger.info("DB tables & indexes ready")
    # Seed initial admin (idempotent)
    from services.auth import seed_admin_if_empty
    await seed_admin_if_empty()
    # Seed agent configs from hardcoded defaults (idempotent)
    from services.config_service import config_service
    await config_service.seed_defaults()
    # Wire config service into model router
    from services.model_router import model_router
    model_router.set_config_service(config_service)
    await vector_store.ensure_collection()
    # 自动创建 MinIO bucket（幂等）
    from minio import Minio
    _mc = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_user,
        secret_key=settings.minio_password,
        secure=False,
    )
    if not _mc.bucket_exists(settings.minio_bucket):
        _mc.make_bucket(settings.minio_bucket)
        logger.info("MinIO bucket created", bucket=settings.minio_bucket)
    else:
        logger.info("MinIO bucket ready", bucket=settings.minio_bucket)
    # 恢复卡死的文档任务（converting/slicing 超过 15 分钟视为任务丢失）
    from datetime import datetime, timedelta, timezone
    from models.document import Document
    from sqlalchemy import select as _select
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=15)
    async with db_engine.connect() as _conn:
        pass  # ensure engine is warm before using session
    from models import async_session_maker as _asm
    async with _asm() as _s:
        _stuck = (await _s.execute(
            _select(Document).where(
                Document.conversion_status.in_(["converting", "slicing"]),
                Document.updated_at < cutoff,
            )
        )).scalars().all()
        for _doc in _stuck:
            _doc.conversion_status = "pending"
        if _stuck:
            await _s.commit()
            from tasks.convert_task import process_document as _pd
            for _doc in _stuck:
                _pd.delay(_doc.id)
            logger.warning("stuck_documents_requeued", count=len(_stuck))
    logger.info("Startup complete")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "kb-system"}


@app.get("/health/db")
async def health_db():
    from sqlalchemy import text
    from models import engine  # 使用共享 engine（已配置 ssl=False）
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/health/redis")
async def health_redis():
    import redis.asyncio as aioredis
    try:
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/health/models")
async def health_models():
    from services.model_router import model_router
    results = await model_router.test_connectivity()
    return results


@app.get("/health/worker")
async def health_worker():
    """检测 Celery Worker 存活性"""
    from tasks.convert_task import celery_app
    try:
        inspect = celery_app.control.inspect()
        active = inspect.active()
        if active is None:
            return {"status": "error", "message": "No active workers found"}
        return {
            "status": "ok",
            "active_workers": list(active.keys()),
            "stats": inspect.stats()
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/api/stats")
async def stats():
    from services.vector_store import vector_store
    from models.document import Document
    from models.chunk import Chunk
    from models import async_session_maker
    from sqlalchemy import select, func, text

    async with async_session_maker() as session:
        doc_count = await session.scalar(select(func.count()).select_from(Document))
        chunk_count = await session.scalar(select(func.count()).select_from(Chunk))
        status_res = await session.execute(text("SELECT conversion_status, count(*) FROM documents GROUP BY conversion_status"))
        status_map = {r[0]: r[1] for r in status_res}

    qdrant_info = await vector_store.collection_info()

    return {
        "documents": doc_count,
        "chunks": chunk_count,
        "vectors": qdrant_info.get("vectors_count", 0),
        "status_distribution": status_map
    }


@app.get("/health/test_redis")
async def test_redis():
    import redis.asyncio as aioredis
    import uuid
    try:
        r = aioredis.from_url(settings.redis_url)
        test_key = f"diag:{uuid.uuid4()}"
        await r.set(test_key, "working", ex=10)
        val = await r.get(test_key)
        return {"status": "ok", "test_key": test_key, "value": val}
    except Exception as e:
        return {"status": "error", "detail": str(e)}
