import httpx
import structlog
from config import settings

logger = structlog.get_logger()


class RerankService:
    def __init__(self):
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            # 8s 上限：rerank 慢时 kb_agent 会捕获异常 fallback 到向量分数
            self._client = httpx.AsyncClient(timeout=8.0)
        return self._client

    async def rerank(
        self, query: str, documents: list[str], top_n: int = 5
    ) -> list[tuple[int, float]]:
        """返回 [(doc_index, relevance_score)]，按相关度降序。"""
        resp = await self.client.post(
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
        return [(r["index"], r["relevance_score"]) for r in results[:top_n]]


rerank_service = RerankService()
