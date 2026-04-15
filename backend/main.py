from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog

from config import settings
from api import documents, chunks, qa, challenge, review, export
from services.vector_store import vector_store

logger = structlog.get_logger()

app = FastAPI(
    title="KB System API",
    description="纷享销客 CRM 知识库管理系统",
    version="1.0.0",
)

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


@app.on_event("startup")
async def startup():
    logger.info("Starting KB System...")
    # 自动建表（幂等，生产环境安全）
    from models import Base, engine as db_engine
    from models.document import Document  # noqa: F401 — side-effect import
    from models.chunk import Chunk  # noqa: F401
    from models.challenge import Challenge  # noqa: F401
    from models.review_queue import ReviewQueue  # noqa: F401
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
    logger.info("DB tables & indexes ready")
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


@app.get("/api/stats")
async def stats():
    from services.vector_store import vector_store
    from models.document import Document
    from models.chunk import Chunk
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import select, func

    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession)

    async with async_session() as session:
        doc_count = await session.scalar(select(func.count()).select_from(Document))
        chunk_count = await session.scalar(select(func.count()).select_from(Chunk))

    qdrant_info = await vector_store.collection_info()

    return {
        "documents": doc_count,
        "chunks": chunk_count,
        "vectors": qdrant_info.get("vectors_count", 0),
    }
