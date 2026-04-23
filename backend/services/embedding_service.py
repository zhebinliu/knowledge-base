import asyncio
import httpx
import structlog
from config import settings

logger = structlog.get_logger()


class EmbeddingService:
    def __init__(self):
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def embed(self, text: str) -> list[float]:
        return (await self.embed_batch([text]))[0]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        # 429 退避: 5s / 10s / 20s
        backoffs = [5, 10, 20]
        attempt = 0
        while True:
            resp = await self.client.post(
                f"{settings.embedding_api_base}/embeddings",
                headers={"Authorization": f"Bearer {settings.embedding_api_key}"},
                json={"model": settings.embedding_model, "input": texts},
            )
            if resp.status_code == 429 and attempt < len(backoffs):
                wait = backoffs[attempt]
                attempt += 1
                logger.warning("embedding_rate_limited", attempt=attempt, wait_s=wait)
                await asyncio.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()["data"]
            data.sort(key=lambda x: x["index"])
            return [item["embedding"] for item in data]


embedding_service = EmbeddingService()
