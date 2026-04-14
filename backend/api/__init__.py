"""
API 包 —— FastAPI 路由层

路由说明：
  - documents: 文档管理 /api/documents
  - chunks:    切片管理 /api/chunks
  - qa:        问答接口 /api/qa
  - challenge: 挑战管理 /api/challenge
  - review:    审核队列 /api/review
  - export:    导入导出 /api/transfer
"""

from api import documents, chunks, qa, challenge, review, export

__all__ = [
    "documents",
    "chunks",
    "qa",
    "challenge",
    "review",
    "export",
]
