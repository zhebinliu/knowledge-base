"""
所有 Agent 通过 ModelRouter 调用大模型。
不在业务代码中硬编码模型名或 API 地址。
更换模型只改这里的配置。
所有模型均使用 OpenAI 兼容的 /v1/chat/completions 接口。

代理说明：
  主代理 (edgefn):  https://api.edgefn.net/v1  — GLM-5 / MiniMax-M2.5 / Qwen3
  小米 Mimo:        https://token-plan-cn.xiaomimimo.com/v1
"""

import asyncio
import structlog
import httpx
from config import settings

logger = structlog.get_logger()

# edgefn 代理 base URL（统一接入 GLM / MiniMax / Qwen）
_EDGEFN = "https://api.edgefn.net/v1"
# 小米 Mimo base URL
_XIAOMI = "https://token-plan-cn.xiaomimimo.com/v1"

MODEL_REGISTRY = {
    "minimax-m2.5": {
        "provider": "minimax",
        "api_base": _EDGEFN,
        "model_id": "MiniMax-M2.5",
        "api_key_env": "minimax_api_key",
        "max_context": 196608,
        "best_for": ["batch_classification", "conversion", "slicing"],
    },
    "minimax-m2.7": {
        "provider": "minimax",
        "api_base": _EDGEFN,
        "model_id": "MiniMax-M2.5",          # 代理暂用 M2.5 兼容
        "api_key_env": "minimax_api_key",
        "max_context": 196608,
        "best_for": ["doc_generation", "office_tasks"],
    },
    "mimo-v2-pro": {
        "provider": "xiaomi",
        "api_base": _XIAOMI,
        "model_id": "mimo-v2-pro",
        "api_key_env": "xiaomi_api_key",
        "max_context": 1000000,
        "best_for": ["challenge_questioning", "agent_tasks"],
    },
    "mimo-v2-omni": {
        "provider": "xiaomi",
        "api_base": _XIAOMI,
        "model_id": "mimo-v2-omni",
        "api_key_env": "xiaomi_api_key",
        "max_context": 262144,
        "best_for": ["ocr_fallback", "image_understanding"],
    },
    "glm-5": {
        "provider": "zhipu",
        "api_base": _EDGEFN,
        "model_id": "GLM-5",
        "api_key_env": "zhipu_api_key",
        "max_context": 200000,
        "best_for": ["judging", "review", "complex_reasoning"],
    },
    "glm-4.7": {
        "provider": "zhipu",
        "api_base": _EDGEFN,
        "model_id": "GLM-5",                  # 代理暂用 GLM-5 兼容
        "api_key_env": "zhipu_api_key",
        "max_context": 200000,
        "best_for": ["dev_testing", "prompt_debugging"],
    },
    "qwen3-next-80b-a3b": {
        "provider": "alibaba",
        "api_base": _EDGEFN,
        "model_id": "Qwen3-Next-80B-A3B-Instruct",
        "api_key_env": "dashscope_api_key",
        "max_context": 262144,
        "best_for": ["daily_qa", "quality_check"],
    },
    "qwen3-235b-a22b": {
        "provider": "alibaba",
        "api_base": _EDGEFN,
        "model_id": "Qwen3-Next-80B-A3B-Instruct",  # 代理暂用该 Qwen 兼容
        "api_key_env": "dashscope_api_key",
        "max_context": 262144,
        "best_for": ["complex_qa"],
    },
}

ROUTING_RULES = {
    "conversion":             {"primary": "minimax-m2.5",      "fallback": "mimo-v2-pro"},
    "daily_qa":               {"primary": "qwen3-next-80b-a3b", "fallback": "glm-5"},
    "doc_generation":         {"primary": "minimax-m2.7",      "fallback": "glm-5"},
    "slicing_classification": {"primary": "minimax-m2.5",      "fallback": "mimo-v2-pro"},
    "slicing_review":         {"primary": "glm-5",             "fallback": "minimax-m2.5"},
    "challenge_questioning":  {"primary": "mimo-v2-pro",       "fallback": "glm-5"},
    "challenge_judging":      {"primary": "glm-5",             "fallback": "qwen3-next-80b-a3b"},
}


class ModelRouter:
    def __init__(self):
        self._failure_counts: dict[str, int] = {}
        self._config_service = None
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=180.0)
        return self._client

    def set_config_service(self, svc):
        self._config_service = svc

    async def _get_model_config(self, model_name: str) -> dict:
        if self._config_service:
            cfg = await self._config_service.get("model_registry", model_name)
            if cfg:
                return cfg
        return MODEL_REGISTRY[model_name]

    async def _get_routing_rule(self, task: str) -> dict:
        if self._config_service:
            cfg = await self._config_service.get("routing_rules", task)
            if cfg:
                return cfg
        return ROUTING_RULES.get(task, {"primary": "qwen3-next-80b-a3b", "fallback": "glm-5"})

    async def _get_task_params(self, task: str) -> dict:
        if self._config_service:
            cfg = await self._config_service.get("task_params", task)
            if cfg:
                return cfg
        return {}

    async def _get_api_key(self, config: dict) -> str:
        key_attr = config.get("api_key_env", "")
        # DB api_keys take precedence over .env
        if self._config_service and key_attr:
            db_key = await self._config_service.get("api_keys", key_attr)
            if db_key and db_key.get("value"):
                return db_key["value"]
        return getattr(settings, key_attr, "")

    async def chat(
        self,
        model_name: str,
        messages: list[dict],
        max_tokens: int = 8000,
        temperature: float = 0.3,
        response_format: dict | None = None,
        timeout: float = 180.0,
    ) -> tuple[str, str]:
        """Returns (content, model_name) tuple. Retries on 429 with exponential backoff."""
        config = await self._get_model_config(model_name)
        api_key = await self._get_api_key(config)

        payload: dict = {
            "model": config["model_id"],
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if response_format:
            payload["response_format"] = response_format

        # 429 退避: 5s, 10s, 20s；其他错误不重试
        backoffs = [5, 10, 20]
        attempt = 0
        while True:
            try:
                resp = await self.client.post(
                    f"{config['api_base']}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=timeout,
                )
                if resp.status_code == 429 and attempt < len(backoffs):
                    wait = backoffs[attempt]
                    attempt += 1
                    logger.warning("rate_limited_retrying", model=model_name, attempt=attempt, wait_s=wait)
                    await asyncio.sleep(wait)
                    continue
                resp.raise_for_status()
                self._failure_counts[model_name] = 0
                content = resp.json()["choices"][0]["message"]["content"]
                return content, model_name
            except httpx.HTTPStatusError as e:
                # 429 已在上面处理；到这里说明退避用完仍 429，或其他 4xx/5xx
                self._failure_counts[model_name] = self._failure_counts.get(model_name, 0) + 1
                logger.error("model_call_failed", model=model_name, status=e.response.status_code, error=str(e)[:200])
                raise
            except Exception as e:
                self._failure_counts[model_name] = self._failure_counts.get(model_name, 0) + 1
                logger.error("model_call_failed", model=model_name, error=str(e)[:200] or type(e).__name__)
                raise

    async def chat_with_routing(
        self,
        task: str,
        messages: list[dict],
        **kwargs,
    ) -> tuple[str, str]:
        """Returns (content, model_name) tuple with automatic fallback."""
        rule = await self._get_routing_rule(task)
        primary = rule["primary"]
        fallback = rule["fallback"]
        # Merge DB task params as defaults; explicit kwargs override
        db_params = await self._get_task_params(task)
        merged = {**db_params, **kwargs}

        try:
            return await self.chat(primary, messages, **merged)
        except Exception as e:
            logger.warning("falling_back", task=task, primary=primary, fallback=fallback, reason=str(e)[:100])
            return await self.chat(fallback, messages, **merged)

    async def chat_stream(
        self,
        model_name: str,
        messages: list[dict],
        max_tokens: int = 8000,
        temperature: float = 0.3,
        timeout: float = 180.0,
    ):
        """Async generator yielding (token, None) during streaming, then (None, model_name) at end."""
        import json as _json
        config = await self._get_model_config(model_name)
        api_key = await self._get_api_key(config)
        payload: dict = {
            "model": config["model_id"],
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
        }
        try:
            async with self.client.stream(
                "POST",
                f"{config['api_base']}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=timeout,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    if data == "[DONE]":
                        yield None, model_name
                        return
                    try:
                        chunk = _json.loads(data)
                        delta = chunk["choices"][0]["delta"].get("content") or ""
                        if delta:
                            yield delta, None
                    except Exception:
                        pass
        except Exception as e:
            self._failure_counts[model_name] = self._failure_counts.get(model_name, 0) + 1
            logger.error("stream_failed", model=model_name, error=str(e)[:200])
            raise

    async def chat_stream_with_routing(
        self,
        task: str,
        messages: list[dict],
        **kwargs,
    ):
        """Async generator yielding (token, None) during streaming, then (None, model_name) at end."""
        rule = await self._get_routing_rule(task)
        primary = rule["primary"]
        fallback = rule["fallback"]
        db_params = await self._get_task_params(task)
        kwargs = {**db_params, **kwargs}

        try:
            async for token, model in self.chat_stream(primary, messages, **kwargs):
                yield token, model
        except Exception as e:
            logger.warning("stream_falling_back", task=task, primary=primary, fallback=fallback, reason=str(e)[:100])
            async for token, model in self.chat_stream(fallback, messages, **kwargs):
                yield token, model

    async def test_connectivity(self) -> dict:
        test_msg = [{"role": "user", "content": "回复OK"}]
        results = {}
        for model_name in ["minimax-m2.5", "glm-5", "qwen3-next-80b-a3b", "mimo-v2-pro"]:
            try:
                _content, _model = await self.chat(model_name, test_msg, max_tokens=5, timeout=15.0)
                results[model_name] = "ok"
            except Exception as e:
                results[model_name] = f"error: {str(e)[:120]}"
        return results


model_router = ModelRouter()
