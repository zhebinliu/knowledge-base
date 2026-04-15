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
    r = httpx.get(f"{BASE_URL}/api/stats", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "documents" in data
    assert "chunks" in data


def test_docs_endpoint():
    """FastAPI 自动文档"""
    r = httpx.get(f"{BASE_URL}/docs", timeout=10)
    assert r.status_code == 200
