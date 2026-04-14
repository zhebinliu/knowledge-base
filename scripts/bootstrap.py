"""
一键初始化所有基础设施的引导脚本
运行方式：python scripts/bootstrap.py

执行顺序：
  1. 等待所有 Docker 服务健康
  2. 初始化 PostgreSQL（建表 + 索引）
  3. 初始化 Qdrant（创建 Collection + Payload 索引）
  4. 初始化 MinIO（创建 Bucket）
  5. 验证 Embedding 服务
  6. 验证模型 API 连通性
"""

import sys
import os
import time
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))


def wait_for_service(url: str, name: str, max_wait: int = 60, interval: int = 3) -> bool:
    """等待 HTTP 服务就绪"""
    import httpx
    print(f"  ⏳ 等待 {name} 就绪...", end="", flush=True)
    start = time.time()
    while time.time() - start < max_wait:
        try:
            r = httpx.get(url, timeout=3)
            if r.status_code < 500:
                print(f" ✅")
                return True
        except Exception:
            pass
        time.sleep(interval)
        print(".", end="", flush=True)
    print(f" ❌ 超时 ({max_wait}s)")
    return False


def step(title: str):
    print(f"\n{'─'*50}")
    print(f"  {title}")
    print(f"{'─'*50}")


# ──────────────────────────────────────────────
# 主流程
# ──────────────────────────────────────────────

async def main():
    print("\n🚀 KB System 基础设施一键初始化\n")
    errors = []

    # Step 1: 等待 Docker 服务就绪
    step("Step 1: 等待 Docker 服务就绪")
    services = [
        ("http://localhost:8000/health", "FastAPI"),
        ("http://localhost:6333/collections", "Qdrant"),
        ("http://localhost:9000/minio/health/live", "MinIO"),
        ("http://localhost:6379", "Redis"),          # Redis 用 TCP，这里只做简单 check
    ]
    for url, name in services[:-1]:  # Redis 单独处理
        if not wait_for_service(url, name):
            errors.append(f"{name} 未就绪")

    # Redis 用 redis-py 检查
    try:
        import redis
        r = redis.from_url("redis://localhost:6379/0", socket_connect_timeout=3)
        r.ping()
        print(f"  ✅ Redis 已就绪")
    except Exception as e:
        print(f"  ❌ Redis: {e}")
        errors.append(f"Redis 未就绪: {e}")

    if errors:
        print(f"\n❌ 部分服务未就绪，请检查 docker-compose 状态：")
        for e in errors:
            print(f"   - {e}")
        sys.exit(1)

    # Step 2: 初始化 PostgreSQL
    step("Step 2: 初始化 PostgreSQL（建表 + 索引）")
    try:
        from sqlalchemy.ext.asyncio import create_async_engine
        from sqlalchemy import text
        from models import Base
        from models.document import Document
        from models.chunk import Chunk
        from models.challenge import Challenge
        from models.review_queue import ReviewQueue
        from config import settings

        engine = create_async_engine(settings.database_url, echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("  ✅ 数据表创建/确认完成")

        async with engine.begin() as conn:
            indexes = [
                "CREATE INDEX IF NOT EXISTS idx_chunks_ltc ON chunks(ltc_stage)",
                "CREATE INDEX IF NOT EXISTS idx_chunks_industry ON chunks(industry)",
                "CREATE INDEX IF NOT EXISTS idx_chunks_review ON chunks(review_status)",
                "CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id)",
            ]
            for idx_sql in indexes:
                await conn.execute(text(idx_sql))
        print("  ✅ 索引创建/确认完成")
        await engine.dispose()
    except Exception as e:
        print(f"  ❌ PostgreSQL 初始化失败: {e}")
        errors.append(str(e))

    # Step 3: 初始化 Qdrant
    step("Step 3: 初始化 Qdrant")
    try:
        from qdrant_client import QdrantClient
        from qdrant_client.models import VectorParams, Distance, PayloadSchemaType, HnswConfigDiff
        from config import settings

        client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
        collection = settings.qdrant_collection
        existing = [c.name for c in client.get_collections().collections]

        if collection not in existing:
            client.create_collection(
                collection_name=collection,
                vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
                hnsw_config=HnswConfigDiff(m=16, ef_construct=200),
            )
            print(f"  ✅ Collection '{collection}' 创建成功")
        else:
            print(f"  ✅ Collection '{collection}' 已存在")

        for field, schema in [
            ("ltc_stage", PayloadSchemaType.KEYWORD),
            ("industry", PayloadSchemaType.KEYWORD),
            ("document_id", PayloadSchemaType.KEYWORD),
        ]:
            try:
                client.create_payload_index(collection, field, schema)
                print(f"  ✅ Payload 索引: {field}")
            except Exception:
                print(f"  ✅ Payload 索引 '{field}' 已存在")

    except Exception as e:
        print(f"  ❌ Qdrant 初始化失败: {e}")
        errors.append(str(e))

    # Step 4: 初始化 MinIO
    step("Step 4: 初始化 MinIO")
    try:
        from minio import Minio
        from config import settings

        client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_user,
            secret_key=settings.minio_password,
            secure=False,
        )
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)
            print(f"  ✅ Bucket '{settings.minio_bucket}' 创建成功")
        else:
            print(f"  ✅ Bucket '{settings.minio_bucket}' 已存在")
    except Exception as e:
        print(f"  ❌ MinIO 初始化失败: {e}")
        errors.append(str(e))

    # Step 5: 验证 Embedding 服务
    step("Step 5: 验证 Embedding 服务（bge-m3）")
    try:
        import httpx
        from config import settings

        r = httpx.post(
            f"{settings.embedding_api_base}/embeddings",
            headers={"Authorization": f"Bearer {settings.embedding_api_key}"},
            json={"model": settings.embedding_model, "input": "初始化测试"},
            timeout=30,
        )
        r.raise_for_status()
        vec = r.json()["data"][0]["embedding"]
        assert len(vec) == 1024, f"向量维度错误: {len(vec)}"
        print(f"  ✅ Embedding 服务正常，向量维度: {len(vec)}")
    except Exception as e:
        print(f"  ❌ Embedding 服务测试失败: {e}")
        errors.append(str(e))

    # Step 6: 验证大模型 API
    step("Step 6: 验证大模型 API 连通性")
    try:
        from services.model_router import model_router
        results = await model_router.test_connectivity()
        for model, status in results.items():
            symbol = "✅" if status == "ok" else "⚠️"
            print(f"  {symbol} {model}: {status}")
    except Exception as e:
        print(f"  ❌ 模型测试失败: {e}")

    # 最终汇总
    print(f"\n{'='*50}")
    if not errors:
        print("  🎉 所有基础设施初始化完成！")
        print("  ▶  现在可运行：python scripts/test_phase0.py")
        print(f"{'='*50}\n")
    else:
        print(f"  ⚠️  初始化完成，但有 {len(errors)} 个错误：")
        for e in errors:
            print(f"     - {e}")
        print(f"{'='*50}\n")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
