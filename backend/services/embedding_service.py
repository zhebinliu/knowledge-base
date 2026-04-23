import asyncio
import hashlib
import json
import httpx
import structlog
from config import settings

logger = structlog.get_logger()

_CACHE_TTL_S = 60 * 60 * 24  # 24h


class EmbeddingService:
    def __init__(self):
        self._client: httpx.AsyncClient | None = None
        self._redis = None  # 懒加载，避免 import-time 连 Redis

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def _get_redis(self):
        if self._redis is None:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(settings.redis_url, decode_responses=False)
        return self._redis

    def _cache_key(self, text: str) -> str:
        h = hashlib.sha1(text.encode("utf-8")).hexdigest()
        return f"emb:{settings.embedding_model}:{h}"

    async def embed(self, text: str, use_cache: bool = False) -> list[float]:
        if use_cache:
            try:
                r = await self._get_redis()
                raw = await r.get(self._cache_key(text))
                if raw:
                    return json.loads(raw)
            except Exception as e:
                logger.warning("embedding_cache_read_failed", error=str(e)[:100])

        vec = (await self.embed_batch([text]))[0]

        if use_cache:
            try:
                r = await self._get_redis()
                await r.set(self._cache_key(text), json.dumps(vec), ex=_CACHE_TTL_S)
            except Exception as e:
                logger.warning("embedding_cache_write_failed", error=str(e)[:100])

        return vec

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
