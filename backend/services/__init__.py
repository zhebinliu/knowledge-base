"""
Services 包 —— 基础服务层

功能说明：
  - model_router:      大模型路由，所有 Agent 通过它调用 LLM
  - embedding_service: 文本向量化（bge-m3）
  - rerank_service:    检索结果重排（bge-reranker-v2-m3）
  - vector_store:      Qdrant 封装，插入/检索向量
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
