"""
所有 Agent 通过 ModelRouter 调用大模型。
不在业务代码中硬编码模型名或 API 地址。
更换模型只改这里的配置。
所有模型均使用 OpenAI 兼容的 /v1/chat/completions 接口。
"""

import asyncio
import structlog
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from config import settings

logger = structlog.get_logger()

MODEL_REGISTRY = {
    "minimax-m2.5": {
        "provider": "minimax",
        "api_base": "https://api.minimax.chat/v1",
        "model_id": "MiniMax-M2.5",
        "api_key_env": "minimax_api_key",
        "max_context": 196608,
        "best_for": ["batch_classification", "conversion", "slicing"],
    },
    "minimax-m2.7": {
        "provider": "minimax",
        "api_base": "https://api.minimax.chat/v1",
        "model_id": "MiniMax-M2.7",
        "api_key_env": "minimax_api_key",
        "max_context": 204800,
        "best_for": ["doc_generation", "office_tasks"],
    },
    "mimo-v2-pro": {
        "provider": "xiaomi",
        "api_base": "https://api.mimo.xiaomi.com/v1",
        "model_id": "mimo-v2-pro",
        "api_key_env": "xiaomi_api_key",
        "max_context": 1000000,
        "best_for": ["challenge_questioning", "agent_tasks"],
    },
    "mimo-v2-omni": {
        "provider": "xiaomi",
        "api_base": "https://api.mimo.xiaomi.com/v1",
        "model_id": "mimo-v2-omni",
        "api_key_env": "xiaomi_api_key",
        "max_context": 262144,
        "best_for": ["ocr_fallback", "image_understanding"],
    },
    "glm-5": {
        "provider": "zhipu",
        "api_base": "https://open.bigmodel.cn/api/paas/v4",
        "model_id": "glm-5",
        "api_key_env": "zhipu_api_key",
        "max_context": 200000,
        "best_for": ["judging", "review", "complex_reasoning"],
    },
    "glm-4.7": {
        "provider": "zhipu",
        "api_base": "https://open.bigmodel.cn/api/paas/v4",
        "model_id": "glm-4.7",
        "api_key_env": "zhipu_api_key",
        "max_context": 202800,
        "best_for": ["dev_testing", "prompt_debugging"],
    },
    "qwen3-next-80b-a3b": {
        "provider": "alibaba",
        "api_base": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model_id": "qwen3-next-80b-a3b-instruct",
        "api_key_env": "dashscope_api_key",
        "max_context": 262144,
        "best_for": ["daily_qa", "quality_check"],
    },
    "qwen3-235b-a22b": {
        "provider": "alibaba",
        "api_base": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model_id": "qwen3-235b-a22b",
        "api_key_env": "dashscope_api_key",
        "max_context": 131072,
        "best_for": ["complex_qa"],
    },
}

ROUTING_RULES = {
    "conversion": {"primary": "minimax-m2.5", "fallback": "mimo-v2-pro"},
    "daily_qa": {"primary": "qwen3-next-80b-a3b", "fallback": "minimax-m2.5", "upgrade_to": "qwen3-235b-a22b"},
    "doc_generation": {"primary": "minimax-m2.7", "fallback": "glm-5"},
    "slicing_classification": {"primary": "minimax-m2.5", "fallback": "qwen3-next-80b-a3b"},
    "slicing_review": {"primary": "glm-5", "fallback": "minimax-m2.7"},
    "challenge_questioning": {"primary": "mimo-v2-pro", "fallback": "glm-5"},
    "challenge_judging": {"primary": "glm-5", "fallback": "minimax-m2.7"},
}


class ModelRouter:
    def __init__(self):
        self._failure_counts: dict[str, int] = {}
        self._fallback_active: dict[str, bool] = {}

    def _get_api_key(self, model_name: str) -> str:
        config = MODEL_REGISTRY[model_name]
        key_attr = config["api_key_env"]
        return getattr(settings, key_attr, "")

    async def chat(
        self,
        model_name: str,
        messages: list[dict],
        max_tokens: int = 2000,
        temperature: float = 0.3,
        response_format: dict | None = None,
        timeout: float = 60.0,
    ) -> str:
        config = MODEL_REGISTRY[model_name]
        api_key = self._get_api_key(model_name)

        payload = {
            "model": config["model_id"],
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if response_format:
            payload["response_format"] = response_format

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{config['api_base']}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=payload,
                )
                resp.raise_for_status()
                self._failure_counts[model_name] = 0
                return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            self._failure_counts[model_name] = self._failure_counts.get(model_name, 0) + 1
            logger.error("model_call_failed", model=model_name, error=str(e), failures=self._failure_counts[model_name])
            raise

    async def chat_with_routing(
        self,
        task: str,
        messages: list[dict],
        **kwargs,
    ) -> str:
        rule = ROUTING_RULES.get(task, {"primary": "qwen3-next-80b-a3b", "fallback": "glm-5"})
        primary = rule["primary"]
        fallback = rule["fallback"]

        try:
            return await self.chat(primary, messages, **kwargs)
        except Exception as e:
            logger.warning("falling_back", task=task, primary=primary, fallback=fallback, reason=str(e))
            return await self.chat(fallback, messages, **kwargs)

    async def test_connectivity(self) -> dict:
        results = {}
        test_msg = [{"role": "user", "content": "回复OK"}]

        for model_name in ["minimax-m2.5", "glm-5", "qwen3-next-80b-a3b", "mimo-v2-pro"]:
            try:
                resp = await self.chat(model_name, test_msg, max_tokens=5, timeout=15.0)
                results[model_name] = "ok"
            except Exception as e:
                results[model_name] = f"error: {str(e)[:100]}"

        return results


model_router = ModelRouter()
