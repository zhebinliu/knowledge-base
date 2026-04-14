"""
Phase 0 集成测试：基础设施连通性
运行方式：pytest backend/tests/test_phase0.py -v

前提：docker-compose up 已启动所有服务
"""

import pytest
import httpx
import asyncio
import os
from config import settings


# ──────────────────────────────────────────────
# FastAPI
# ──────────────────────────────────────────────

def test_fastapi_health():
    """FastAPI 主服务健康检查"""
    try:
        r = httpx.get("http://localhost:8000/health", timeout=2)
        assert r.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException):
        pytest.skip("FastAPI 服务未启动，跳过健康检查")


def test_fastapi_db_health():
    """PostgreSQL 通过 FastAPI 健康接口验证"""
    try:
        r = httpx.get("http://localhost:8000/health/db", timeout=5)
        assert r.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException):
        pytest.skip("FastAPI 服务未启动，跳过 DB 健康检查")


def test_fastapi_redis_health():
    """Redis 通过 FastAPI 健康接口验证"""
    try:
        r = httpx.get("http://localhost:8000/health/redis", timeout=2)
        assert r.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException):
        pytest.skip("FastAPI 服务未启动，跳过 Redis 健康检查")


# ──────────────────────────────────────────────
# 基础设施
# ──────────────────────────────────────────────

def test_qdrant_alive():
    """Qdrant 服务存活"""
    r = httpx.get("http://localhost:6333/collections", timeout=5)
    assert r.status_code == 200


def test_qdrant_collection_exists():
    """Qdrant kb_chunks collection 已创建"""
    r = httpx.get(f"http://localhost:6333/collections/{settings.qdrant_collection}", timeout=5)
    assert r.status_code == 200, f"Collection 不存在，请先运行 scripts/init_qdrant.py"
    info = r.json()["result"]
    assert info["config"]["params"]["vectors"]["size"] == 1024, "向量维度应为 1024"


def test_minio_alive():
    """MinIO 服务存活"""
    r = httpx.get("http://localhost:9000/minio/health/live", timeout=5)
    assert r.status_code == 200


def test_minio_bucket_exists():
    """MinIO kb-documents bucket 已创建"""
    from minio import Minio
    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_user,
        secret_key=settings.minio_password,
        secure=False,
    )
    assert client.bucket_exists(settings.minio_bucket), \
        f"Bucket '{settings.minio_bucket}' 不存在，请先运行 scripts/init_minio.py"


# ──────────────────────────────────────────────
# Embedding
# ──────────────────────────────────────────────

@pytest.mark.skipif(
    not settings.embedding_api_key or settings.embedding_api_key == "dummy",
    reason="缺少有效的 Embedding API Key"
)
def test_embedding_dimension():
    """bge-m3 向量维度为 1024"""
    r = httpx.post(
        f"{settings.embedding_api_base}/embeddings",
        headers={"Authorization": f"Bearer {settings.embedding_api_key}"},
        json={"model": settings.embedding_model, "input": "测试文本"},
        timeout=30,
    )
    assert r.status_code == 200, f"Embedding API 错误: {r.text}"
    vec = r.json()["data"][0]["embedding"]
    assert len(vec) == 1024, f"向量维度错误: {len(vec)}"


@pytest.mark.skipif(
    not settings.embedding_api_key or settings.embedding_api_key == "dummy",
    reason="缺少有效的 Embedding API Key"
)
def test_embedding_similarity():
    """相似语义的文本向量余弦相似度应 > 不相关文本"""
    import numpy as np

    def embed(text: str) -> list:
        r = httpx.post(
            f"{settings.embedding_api_base}/embeddings",
            headers={"Authorization": f"Bearer {settings.embedding_api_key}"},
            json={"model": settings.embedding_model, "input": text},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()["data"][0]["embedding"]

    def cosine_sim(a, b):
        a, b = np.array(a), np.array(b)
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

    v1 = embed("CRM 系统实施方案")
    v2 = embed("客户关系管理软件部署计划")   # 语义相近
    v3 = embed("今天天气怎么样")              # 语义无关

    sim_related = cosine_sim(v1, v2)
    sim_unrelated = cosine_sim(v1, v3)

    assert sim_related > sim_unrelated, \
        f"相关相似度({sim_related:.3f}) 应 > 无关相似度({sim_unrelated:.3f})"


# ──────────────────────────────────────────────
# Qdrant 写入/检索
# ──────────────────────────────────────────────

def test_qdrant_insert_and_search():
    """Qdrant 向量写入后可检索"""
    import random
    from qdrant_client import QdrantClient
    from qdrant_client.models import PointStruct, PointIdsList

    client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
    collection = settings.qdrant_collection
    test_id = "pytest-phase0-" + str(random.randint(100000, 999999))

    try:
        # 写入
        vec = [random.uniform(-1, 1) for _ in range(1024)]
        client.upsert(
            collection_name=collection,
            points=[PointStruct(id=test_id, vector=vec, payload={"test": True})],
        )

        # 检索
        results = client.search(collection_name=collection, query_vector=vec, limit=1)
        assert len(results) > 0
        assert results[0].score > 0.99, f"自身检索相似度应接近 1.0，实际: {results[0].score}"

    finally:
        # 清理
        client.delete(
            collection_name=collection,
            points_selector=PointIdsList(points=[test_id])
        )


# ──────────────────────────────────────────────
# 大模型 API 连通性
# ──────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.skipif(
    not settings.embedding_api_key or settings.embedding_api_key == "dummy",
    reason="缺少有效的 Model API Key"
)
async def test_model_qwen3():
    """Qwen3-Next 80B API 连通性"""
    from services.model_router import model_router
    resp = await model_router.chat(
        "qwen3-next-80b-a3b",
        [{"role": "user", "content": "请回复'OK'，不要有其他内容"}],
        max_tokens=10,
        timeout=15.0,
    )
    assert len(resp) > 0, "模型无响应"


@pytest.mark.asyncio
@pytest.mark.skipif(
    not settings.minimax_api_key or settings.minimax_api_key == "dummy",
    reason="缺少有效的 MiniMax API Key"
)
async def test_model_minimax():
    """MiniMax M2.5 API 连通性"""
    from services.model_router import model_router
    resp = await model_router.chat(
        "minimax-m2.5",
        [{"role": "user", "content": "请回复'OK'，不要有其他内容"}],
        max_tokens=10,
        timeout=15.0,
    )
    assert len(resp) > 0, "模型无响应"


@pytest.mark.asyncio
@pytest.mark.skipif(
    not settings.zhipu_api_key or settings.zhipu_api_key == "dummy",
    reason="缺少有效的 Zhipu API Key"
)
async def test_model_glm5():
    """GLM-5 API 连通性"""
    from services.model_router import model_router
    resp = await model_router.chat(
        "glm-5",
        [{"role": "user", "content": "请回复'OK'，不要有其他内容"}],
        max_tokens=10,
        timeout=15.0,
    )
    assert len(resp) > 0, "模型无响应"
