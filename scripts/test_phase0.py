"""
Phase 0 验证脚本：基础设施连通性 + 模型 API 连通性测试
运行方式：python scripts/test_phase0.py

前提：
  1. docker-compose up 已启动所有服务
  2. .env 中已配置所有 API Keys
"""

import sys
import os
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))


# ──────────────────────────────────────────────
# 工具函数
# ──────────────────────────────────────────────

def ok(msg: str):
    print(f"  ✅ {msg}")

def fail(msg: str):
    print(f"  ❌ {msg}")

def section(title: str):
    print(f"\n{'='*50}")
    print(f"  {title}")
    print(f"{'='*50}")


# ──────────────────────────────────────────────
# 同步测试
# ──────────────────────────────────────────────

def test_fastapi():
    section("1. FastAPI 健康检查")
    import httpx
    try:
        r = httpx.get("http://localhost:8000/health", timeout=5)
        assert r.status_code == 200, f"状态码: {r.status_code}"
        data = r.json()
        assert data.get("status") == "ok", f"响应: {data}"
        ok(f"FastAPI 正常  {data}")
    except Exception as e:
        fail(f"FastAPI 异常: {e}")
        return False
    return True


def test_postgres():
    section("2. PostgreSQL 连通性（通过 FastAPI /health/db）")
    import httpx
    try:
        r = httpx.get("http://localhost:8000/health/db", timeout=10)
        data = r.json()
        assert data.get("status") == "ok", f"响应: {data}"
        ok(f"PostgreSQL 正常")
    except Exception as e:
        fail(f"PostgreSQL 异常: {e}")
        return False
    return True


def test_qdrant():
    section("3. Qdrant 连通性")
    import httpx
    try:
        r = httpx.get("http://localhost:6333/collections", timeout=5)
        assert r.status_code == 200
        collections = r.json().get("result", {}).get("collections", [])
        ok(f"Qdrant 正常，已有 {len(collections)} 个 collection")
        for c in collections:
            print(f"     - {c['name']}")
    except Exception as e:
        fail(f"Qdrant 异常: {e}")
        return False
    return True


def test_redis():
    section("4. Redis 连通性（通过 FastAPI /health/redis）")
    import httpx
    try:
        r = httpx.get("http://localhost:8000/health/redis", timeout=5)
        data = r.json()
        assert data.get("status") == "ok", f"响应: {data}"
        ok("Redis 正常")
    except Exception as e:
        fail(f"Redis 异常: {e}")
        return False
    return True


def test_minio():
    section("5. MinIO 连通性")
    import httpx
    try:
        r = httpx.get("http://localhost:9000/minio/health/live", timeout=5)
        assert r.status_code == 200, f"状态码: {r.status_code}"
        ok("MinIO 正常")
    except Exception as e:
        fail(f"MinIO 异常: {e}")
        return False
    return True


def test_embedding():
    section("6. Embedding 服务（bge-m3 via SiliconFlow API）")
    import httpx
    from config import settings

    try:
        r = httpx.post(
            f"{settings.embedding_api_base}/embeddings",
            headers={"Authorization": f"Bearer {settings.embedding_api_key}"},
            json={"model": settings.embedding_model, "input": "测试文本，用于验证 Embedding 接口"},
            timeout=30,
        )
        r.raise_for_status()
        vec = r.json()["data"][0]["embedding"]
        assert len(vec) == 1024, f"向量维度错误: {len(vec)}"
        ok(f"Embedding 正常，向量维度: {len(vec)}")
    except Exception as e:
        fail(f"Embedding 异常: {e}")
        return False
    return True


def test_qdrant_insert_retrieve():
    section("7. Qdrant 向量写入 + 检索测试")
    from qdrant_client import QdrantClient
    from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue
    from config import settings
    import random

    try:
        client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
        collection = settings.qdrant_collection

        # 写入一个测试向量
        test_id = "test-phase0-" + str(random.randint(10000, 99999))
        test_vector = [random.uniform(-1, 1) for _ in range(1024)]
        client.upsert(
            collection_name=collection,
            points=[PointStruct(
                id=test_id,
                vector=test_vector,
                payload={"ltc_stage": "test", "chunk_id": test_id},
            )],
        )
        ok("向量写入成功")

        # 检索
        results = client.search(
            collection_name=collection,
            query_vector=test_vector,
            limit=1,
        )
        assert len(results) > 0, "检索结果为空"
        ok(f"向量检索成功，最高相似度: {results[0].score:.4f}")

        # 删除测试向量
        client.delete(collection_name=collection, points_selector=[test_id])
        ok("测试向量清理完成")

    except Exception as e:
        fail(f"Qdrant 写入/检索异常: {e}")
        return False
    return True


async def test_models_async():
    section("8. 大模型 API 连通性")
    from services.model_router import model_router

    results = await model_router.test_connectivity()
    all_ok = True
    for model, status in results.items():
        if status == "ok":
            ok(f"{model}")
        else:
            fail(f"{model}  →  {status}")
            all_ok = False
    return all_ok


# ──────────────────────────────────────────────
# 主入口
# ──────────────────────────────────────────────

async def main():
    print("\n🚀 Phase 0 基础设施验证开始\n")

    results = {
        "FastAPI":              test_fastapi(),
        "PostgreSQL":           test_postgres(),
        "Qdrant":               test_qdrant(),
        "Redis":                test_redis(),
        "MinIO":                test_minio(),
        "Embedding":            test_embedding(),
        "Qdrant 写入/检索":      test_qdrant_insert_retrieve(),
        "大模型 API":            await test_models_async(),
    }

    section("验证汇总")
    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for name, status in results.items():
        symbol = "✅" if status else "❌"
        print(f"  {symbol} {name}")

    print(f"\n  通过: {passed}/{total}")

    if passed == total:
        print("\n✅ Phase 0 所有验证通过，可以开始 Phase 1！\n")
        return 0
    else:
        print(f"\n⚠️  有 {total - passed} 项未通过，请检查后重试\n")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
