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
    "conversion":             {"primary": "minimax-m2.5",      "fallback": "glm-5"},
    "daily_qa":               {"primary": "qwen3-next-80b-a3b", "fallback": "glm-5"},
    "doc_generation":         {"primary": "minimax-m2.7",      "fallback": "glm-5"},
    "slicing_classification": {"primary": "minimax-m2.5",      "fallback": "qwen3-next-80b-a3b"},
    "slicing_review":         {"primary": "glm-5",             "fallback": "minimax-m2.5"},
    "challenge_questioning":  {"primary": "mimo-v2-pro",       "fallback": "glm-5"},
    "challenge_judging":      {"primary": "glm-5",             "fallback": "qwen3-next-80b-a3b"},
}


class ModelRouter:
    def __init__(self):
        self._failure_counts: dict[str, int] = {}

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

        payload: dict = {
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
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                self._failure_counts[model_name] = 0
                return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            self._failure_counts[model_name] = self._failure_counts.get(model_name, 0) + 1
            logger.error("model_call_failed", model=model_name, error=str(e)[:200])
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
            logger.warning("falling_back", task=task, primary=primary, fallback=fallback, reason=str(e)[:100])
            return await self.chat(fallback, messages, **kwargs)

    async def test_connectivity(self) -> dict:
        test_msg = [{"role": "user", "content": "回复OK"}]
        results = {}
        for model_name in ["minimax-m2.5", "glm-5", "qwen3-next-80b-a3b", "mimo-v2-pro"]:
            try:
                await self.chat(model_name, test_msg, max_tokens=5, timeout=15.0)
                results[model_name] = "ok"
            except Exception as e:
                results[model_name] = f"error: {str(e)[:120]}"
        return results


model_router = ModelRouter()
