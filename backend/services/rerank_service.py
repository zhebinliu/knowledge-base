import httpx
import structlog
from config import settings

logger = structlog.get_logger()


class RerankService:
    async def rerank(self, query: str, documents: list[str], top_n: int = 5) -> list[int]:
        """返回重排后的文档索引列表（按相关度降序）"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.rerank_api_base}/rerank",
                headers={"Authorization": f"Bearer {settings.rerank_api_key}"},
                json={
                    "model": settings.rerank_model,
                    "query": query,
                    "documents": documents,
                    "top_n": top_n,
                },
            )
            resp.raise_for_status()
            results = resp.json()["results"]
            results.sort(key=lambda x: x["relevance_score"], reverse=True)
            return [r["index"] for r in results[:top_n]]


rerank_service = RerankService()
