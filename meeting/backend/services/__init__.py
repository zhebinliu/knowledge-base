"""
meeting.backend.services: 会议服务层 — 存储、同步、AI 处理

overlay 到 backend/services/ 后包含原有的基础服务 + 会议服务
"""

from services.model_router import model_router, ModelRouter, MODEL_REGISTRY, ROUTING_RULES
from services.embedding_service import embedding_service
from services.rerank_service import rerank_service
from services.vector_store import vector_store

__all__ = [
    "model_router",
    "ModelRouter",
    "MODEL_REGISTRY",
    "ROUTING_RULES",
    "embedding_service",
    "rerank_service",
    "vector_store",
]
