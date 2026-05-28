import httpx
import structlog
from config import settings

logger = structlog.get_logger()


async def _resolve_config(key: str, env_attr: str) -> str:
    """优先后台 config_service:rerank.{key},否则回退 settings.{env_attr}。"""
    try:
        from services.config_service import config_service
        cfg = await config_service.get("rerank", key)
        if isinstance(cfg, dict):
            val = cfg.get("value") or cfg.get(key) or cfg.get("v")
            if isinstance(val, str) and val.strip():
                return val
        elif isinstance(cfg, str) and cfg.strip():
            return cfg
    except Exception as e:
        logger.warning("rerank_config_lookup_failed", key=key, error=str(e)[:120])
    return getattr(settings, env_attr, "") or ""


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
        api_base = await _resolve_config("api_base", "rerank_api_base")
        api_key = await _resolve_config("api_key", "rerank_api_key")
        model = await _resolve_config("model", "rerank_model")
        resp = await self.client.post(
            f"{api_base}/rerank",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
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
