"""
Agent configuration service — DB-backed with in-memory cache.
All reads fall back to hardcoded defaults if DB has no entry.
"""

import time
import structlog
from sqlalchemy import select
from models import async_session_maker

logger = structlog.get_logger()

# Default task params (extracted from agents' hardcoded values)
DEFAULT_TASK_PARAMS = {
    "conversion":             {"max_tokens": 8000, "temperature": 0.3, "timeout": 180},
    "daily_qa":               {"max_tokens": 8000, "temperature": 0.3, "timeout": 180},
    "doc_generation":         {"max_tokens": 8000, "temperature": 0.3, "timeout": 180},
    "slicing_classification": {"max_tokens": 8000, "temperature": 0.1, "timeout": 180},
    "slicing_review":         {"max_tokens": 8000, "temperature": 0.1, "timeout": 180},
    "challenge_questioning":  {"max_tokens": 8000, "temperature": 0.7, "timeout": 180},
    "challenge_judging":      {"max_tokens": 8000, "temperature": 0.1, "timeout": 180},
}


class ConfigService:
    def __init__(self):
        self._cache: dict[str, dict] = {}
        self._cache_ts: float = 0
        self._ttl: float = 60.0

    def _cache_key(self, config_type: str, config_key: str) -> str:
        return f"{config_type}::{config_key}"

    def invalidate(self):
        self._cache_ts = 0  # Mark stale but keep data as fallback

    async def _ensure_cache(self):
        if time.time() - self._cache_ts < self._ttl and self._cache:
            return
        from models.agent_config import AgentConfig
        try:
            async with async_session_maker() as session:
                rows = (await session.execute(select(AgentConfig))).scalars().all()
                self._cache = {
                    self._cache_key(r.config_type, r.config_key): r.config_value
                    for r in rows
                }
                self._cache_ts = time.time()
        except Exception as e:
            logger.warning("config_cache_refresh_failed", error=str(e)[:200])
            # On failure: if cache has data, extend TTL to keep serving stale values
            if self._cache:
                self._cache_ts = time.time()
                logger.info("config_serving_stale_cache", entries=len(self._cache))

    async def get(self, config_type: str, config_key: str) -> dict | None:
        await self._ensure_cache()
        return self._cache.get(self._cache_key(config_type, config_key))

    async def get_all(self, config_type: str) -> dict[str, dict]:
        await self._ensure_cache()
        prefix = f"{config_type}::"
        return {
            k[len(prefix):]: v
            for k, v in self._cache.items()
            if k.startswith(prefix)
        }

    async def upsert(self, config_type: str, config_key: str, value: dict, description: str = ""):
        from models.agent_config import AgentConfig
        async with async_session_maker() as session:
            row = (await session.execute(
                select(AgentConfig).where(
                    AgentConfig.config_type == config_type,
                    AgentConfig.config_key == config_key,
                )
            )).scalar_one_or_none()
            if row:
                row.config_value = value
                row.description = description or row.description
            else:
                session.add(AgentConfig(
                    config_type=config_type,
                    config_key=config_key,
                    config_value=value,
                    description=description,
                ))
            await session.commit()
        self.invalidate()

    async def delete(self, config_type: str, config_key: str):
        from models.agent_config import AgentConfig
        async with async_session_maker() as session:
            row = (await session.execute(
                select(AgentConfig).where(
                    AgentConfig.config_type == config_type,
                    AgentConfig.config_key == config_key,
                )
            )).scalar_one_or_none()
            if row:
                await session.delete(row)
                await session.commit()
        self.invalidate()

    async def seed_defaults(self):
        """Insert hardcoded defaults for any missing configs. Won't overwrite user edits."""
        from services.model_router import MODEL_REGISTRY, ROUTING_RULES
        from prompts.conversion import CONVERSION_PROMPT
        from prompts.slicing import CLASSIFICATION_PROMPT
        from prompts.qa import QA_PROMPT, DOC_GENERATE_PROMPT
        from prompts.challenge import CHALLENGE_QUESTION_PROMPT, CHALLENGE_JUDGE_PROMPT

        from models.agent_config import AgentConfig
        async with async_session_maker() as session:
            existing = (await session.execute(select(AgentConfig))).scalars().all()
            existing_keys = {(r.config_type, r.config_key) for r in existing}

            def _add(ct, ck, cv, desc=""):
                if (ct, ck) not in existing_keys:
                    session.add(AgentConfig(config_type=ct, config_key=ck, config_value=cv, description=desc))

            # Models
            for name, cfg in MODEL_REGISTRY.items():
                _add("model_registry", name, cfg, f"Model: {name}")

            # Routing
            for task, rule in ROUTING_RULES.items():
                _add("routing_rules", task, rule, f"Routing: {task}")

            # Task params
            for task, params in DEFAULT_TASK_PARAMS.items():
                _add("task_params", task, params, f"Params: {task}")

            # Prompts
            prompts = {
                "CONVERSION_PROMPT": {"template": CONVERSION_PROMPT, "variables": ["raw_text"]},
                "CLASSIFICATION_PROMPT": {"template": CLASSIFICATION_PROMPT, "variables": ["ltc_taxonomy", "industry_list", "doc_title", "section_path", "chunk_content"]},
                "QA_PROMPT": {"template": QA_PROMPT, "variables": ["retrieved_chunks", "question"]},
                "DOC_GENERATE_PROMPT": {"template": DOC_GENERATE_PROMPT, "variables": ["template", "retrieved_chunks", "project_name", "industry"]},
                "CHALLENGE_QUESTION_PROMPT": {"template": CHALLENGE_QUESTION_PROMPT, "variables": ["target_stage", "chunks_content"]},
                "CHALLENGE_JUDGE_PROMPT": {"template": CHALLENGE_JUDGE_PROMPT, "variables": ["question", "answer", "source_chunks"]},
            }
            for key, val in prompts.items():
                _add("prompt_template", key, val, f"Prompt: {key}")

            await session.commit()
        self.invalidate()
        logger.info("config_seed_complete")


config_service = ConfigService()
