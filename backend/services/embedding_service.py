import asyncio
import hashlib
import json
import httpx
import structlog
from config import settings

logger = structlog.get_logger()

_CACHE_TTL_S = 60 * 60 * 24  # 24h


async def _resolve_config(key: str, env_attr: str) -> str:
    """优先后台 config_service:embedding.{key},否则回退 settings.{env_attr}。

    config_value 在 DB 里存 dict (value/api_base/model/api_key 任一字段),也兼容直接存字符串。
    """
    try:
        from services.config_service import config_service
        cfg = await config_service.get("embedding", key)
        if isinstance(cfg, dict):
            val = cfg.get("value") or cfg.get(key) or cfg.get("v")
            if isinstance(val, str) and val.strip():
                return val
        elif isinstance(cfg, str) and cfg.strip():
            return cfg
    except Exception as e:
        logger.warning("embedding_config_lookup_failed", key=key, error=str(e)[:120])
    return getattr(settings, env_attr, "") or ""


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

    async def _resolve_base(self) -> str:
        return await _resolve_config("api_base", "embedding_api_base")

    async def _resolve_model(self) -> str:
        return await _resolve_config("model", "embedding_model")

    async def _resolve_key(self) -> str:
        return await _resolve_config("api_key", "embedding_api_key")

    async def _cache_key(self, text: str) -> str:
        h = hashlib.sha1(text.encode("utf-8")).hexdigest()
        model = await self._resolve_model()
        return f"emb:{model}:{h}"

    async def embed(self, text: str, use_cache: bool = False) -> list[float]:
        if use_cache:
            try:
                r = await self._get_redis()
                raw = await r.get(await self._cache_key(text))
                if raw:
                    return json.loads(raw)
            except Exception as e:
                logger.warning("embedding_cache_read_failed", error=str(e)[:100])

        vec = (await self.embed_batch([text]))[0]

        if use_cache:
            try:
                r = await self._get_redis()
                await r.set(await self._cache_key(text), json.dumps(vec), ex=_CACHE_TTL_S)
            except Exception as e:
                logger.warning("embedding_cache_write_failed", error=str(e)[:100])

        return vec

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        api_base = await self._resolve_base()
        api_key = await self._resolve_key()
        model = await self._resolve_model()
        # 429 退避: 5s / 10s / 20s
        backoffs = [5, 10, 20]
        attempt = 0
        while True:
            resp = await self.client.post(
                f"{api_base}/embeddings",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"model": model, "input": texts},
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
