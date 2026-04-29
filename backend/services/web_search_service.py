"""Web search abstraction for output generation.

Supports Bocha (api.bochaai.com) and Tavily.
Key 解析顺序:DB(config_service api_keys 表) > .env settings 属性。
后台「系统设置 · API 密钥」可在线维护。
"""
import httpx
import structlog
from config import settings

logger = structlog.get_logger()


async def _resolve_key(env_name: str) -> str:
    """读 key:DB 优先(支持后台动态配置),fallback 到 .env。"""
    try:
        from services.config_service import config_service
        db_entry = await config_service.get("api_keys", env_name)
        if db_entry and db_entry.get("value"):
            return db_entry["value"]
    except Exception as e:
        logger.warning("resolve_key_db_failed", key=env_name, err=str(e)[:80])
    return getattr(settings, env_name, "") or ""


async def web_search(query: str, top_k: int = 5, freshness: str = "noLimit") -> list[dict]:
    """Returns list[{title, url, snippet, source}]. Empty list if no provider configured."""
    bocha_key = await _resolve_key("bocha_api_key")
    if bocha_key:
        return await _search_bocha(query, bocha_key, top_k=top_k, freshness=freshness)
    tavily_key = await _resolve_key("tavily_api_key")
    if tavily_key:
        return await _search_tavily(query, tavily_key, top_k=top_k)
    return []


async def _search_bocha(query: str, api_key: str, top_k: int, freshness: str) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                f"{settings.bocha_api_base}/v1/web-search",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
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


async def _search_tavily(query: str, api_key: str, top_k: int) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": api_key,
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


async def has_web_search_provider() -> bool:
    """异步版 — 后台 DB key + env key 都查。同步调用方请用 has_web_search_provider_sync。"""
    bocha = await _resolve_key("bocha_api_key")
    tavily = await _resolve_key("tavily_api_key")
    return bool(bocha or tavily)


def has_web_search_provider_sync() -> bool:
    """同步版,只查 .env(向后兼容)。运行时建议用异步版。"""
    return bool(settings.bocha_api_key or settings.tavily_api_key)
