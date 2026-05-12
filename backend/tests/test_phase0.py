"""
Phase 0 验证测试：基础服务连通性
运行方式：pytest backend/tests/test_phase0.py -v
"""

import os
import pytest
import httpx
import asyncio

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


def test_health():
    r = httpx.get(f"{BASE_URL}/health", timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_health_db():
    r = httpx.get(f"{BASE_URL}/health/db", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok", f"DB健康检查失败: {data}"


def test_health_redis():
    r = httpx.get(f"{BASE_URL}/health/redis", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok", f"Redis健康检查失败: {data}"


def test_qdrant_direct():
    r = httpx.get("http://localhost:6333/collections", timeout=10)
    assert r.status_code == 200


def test_minio_direct():
    r = httpx.get("http://localhost:9000/minio/health/live", timeout=10)
    assert r.status_code == 200


def test_stats_endpoint():
    # 2026-05-12:/api/stats 加了 get_current_user 鉴权(轻量侦察面收口),
    # 匿名请求返回 401。这里仅校 endpoint 存在 + 鉴权层正常工作。
    r = httpx.get(f"{BASE_URL}/api/stats", timeout=10)
    assert r.status_code == 401, f"预期 401,实际 {r.status_code}"


def test_docs_endpoint():
    """FastAPI 自动文档:KB_ENV=development 才开,production 关掉(2026-05-12)"""
    r = httpx.get(f"{BASE_URL}/docs", timeout=10)
    if os.getenv("KB_ENV", "production") == "development":
        assert r.status_code == 200
    else:
        assert r.status_code == 404
