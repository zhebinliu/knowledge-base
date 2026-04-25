"""Web search abstraction for output generation.

Supports Bocha (api.bochaai.com) and Tavily; both via env keys. If no key, returns [].
"""
import httpx
import structlog
from config import settings

logger = structlog.get_logger()


async def web_search(query: str, top_k: int = 5, freshness: str = "noLimit") -> list[dict]:
    """Returns list[{title, url, snippet, source}]. Empty list if no provider configured."""
    if settings.bocha_api_key:
        return await _search_bocha(query, top_k=top_k, freshness=freshness)
    if settings.tavily_api_key:
        return await _search_tavily(query, top_k=top_k)
    return []


async def _search_bocha(query: str, top_k: int, freshness: str) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                f"{settings.bocha_api_base}/v1/web-search",
                headers={"Authorization": f"Bearer {settings.bocha_api_key}", "Content-Type": "application/json"},
                json={"query": query, "summary": True, "count": top_k, "freshness": freshness},
            )
            r.raise_for_status()
            data = r.json()
        pages = (((data or {}).get("data") or {}).get("webPages") or {}).get("value") or []
        out = []
        for p in pages[:top_k]:
            out.append({
                "title": (p.get("name") or "")[:160],
                "url": p.get("url") or "",
                "snippet": (p.get("summary") or p.get("snippet") or "")[:600],
                "source": "bocha",
            })
        return out
    except Exception as e:
        logger.warning("bocha_search_failed", q=query[:80], err=str(e)[:120])
        return []


async def _search_tavily(query: str, top_k: int) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": settings.tavily_api_key,
                    "query": query,
                    "max_results": top_k,
                    "search_depth": "advanced",
                },
            )
            r.raise_for_status()
            data = r.json()
        out = []
        for p in (data.get("results") or [])[:top_k]:
            out.append({
                "title": (p.get("title") or "")[:160],
                "url": p.get("url") or "",
                "snippet": (p.get("content") or "")[:600],
                "source": "tavily",
            })
        return out
    except Exception as e:
        logger.warning("tavily_search_failed", q=query[:80], err=str(e)[:120])
        return []


def has_web_search_provider() -> bool:
    return bool(settings.bocha_api_key or settings.tavily_api_key)
