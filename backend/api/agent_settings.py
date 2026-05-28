"""
CRUD API for agent configuration: models, routing, task params, prompts.
所有写操作要求管理员；读操作允许已登录用户。
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from services.auth import require_admin
from services.config_service import config_service, DEFAULT_TASK_PARAMS

router = APIRouter(dependencies=[Depends(require_admin)])
logger = structlog.get_logger()


# ---- Models ----

class ModelEntry(BaseModel):
    provider: str = ""
    api_base: str = ""
    model_id: str = ""
    api_key_env: str = ""
    max_context: int = Field(default=128000, ge=1)
    best_for: list[str] = []


class ModelCreateBody(ModelEntry):
    key: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9._-]+$")


@router.get("/models")
async def list_models():
    data = await config_service.get_all("model_registry")
    return [{"key": k, **v} for k, v in data.items()]


@router.put("/models/{key}")
async def update_model(key: str, body: ModelEntry):
    await config_service.upsert("model_registry", key, body.model_dump())
    logger.info("config_changed", action="update", type="model", key=key)
    return {"ok": True}


@router.post("/models")
async def create_model(body: ModelCreateBody):
    existing = await config_service.get("model_registry", body.key)
    if existing:
        raise HTTPException(409, f"Model '{body.key}' already exists")
    key = body.key
    payload = body.model_dump(exclude={"key"})
    await config_service.upsert("model_registry", key, payload)
    logger.info("config_changed", action="create", type="model", key=key)
    return {"ok": True}


@router.delete("/models/{key}")
async def delete_model(key: str):
    # Prevent deleting a model that is in use by routing rules
    routing = await config_service.get_all("routing_rules")
    in_use = [t for t, r in routing.items() if r.get("primary") == key or r.get("fallback") == key]
    if in_use:
        raise HTTPException(
            409, f"Cannot delete model '{key}': in use by routing rules [{', '.join(in_use)}]"
        )
    await config_service.delete("model_registry", key)
    logger.info("config_changed", action="delete", type="model", key=key)
    return {"ok": True}


# ---- Routing Rules ----

class RoutingRule(BaseModel):
    primary: str
    fallback: str


@router.get("/routing")
async def list_routing():
    data = await config_service.get_all("routing_rules")
    return [{"task": k, **v} for k, v in data.items()]


@router.put("/routing/{task}")
async def update_routing(task: str, body: RoutingRule):
    # Validate model keys exist
    models = await config_service.get_all("model_registry")
    for field in [body.primary, body.fallback]:
        if field not in models:
            raise HTTPException(400, f"Model '{field}' not found in registry")
    await config_service.upsert("routing_rules", task, body.model_dump())
    logger.info("config_changed", action="update", type="routing", key=task)
    return {"ok": True}


@router.delete("/routing/{task}")
async def delete_routing(task: str):
    await config_service.delete("routing_rules", task)
    logger.info("config_changed", action="delete", type="routing", key=task)
    return {"ok": True}


# ---- API Keys ----

class ApiKeyBody(BaseModel):
    value: str = Field(..., min_length=1)


@router.get("/api-keys")
async def list_api_keys():
    """List all API keys with masked values."""
    from config import settings as _settings
    # Collect all unique api_key_env names from model registry
    models = await config_service.get_all("model_registry")
    key_envs: set[str] = set()
    for m in models.values():
        env = m.get("api_key_env", "")
        if env:
            key_envs.add(env)
    # Also include embedding/rerank keys + Web search providers
    key_envs.update([
        "embedding_api_key", "rerank_api_key",
        "bocha_api_key",        # Web search · Bocha(api.bochaai.com)
        "tavily_api_key",       # Web search · Tavily
    ])

    result = []
    for env_name in sorted(key_envs):
        # Check DB first
        db_entry = await config_service.get("api_keys", env_name)
        if db_entry and db_entry.get("value"):
            raw = db_entry["value"]
            source = "database"
        else:
            raw = getattr(_settings, env_name, "")
            source = "env"
        masked = _mask_key(raw) if raw else ""
        result.append({"key": env_name, "masked_value": masked, "source": source, "is_set": bool(raw)})
    return result


@router.put("/api-keys/{key}")
async def update_api_key(key: str, body: ApiKeyBody):
    await config_service.upsert("api_keys", key, {"value": body.value})
    logger.info("config_changed", action="update", type="api_key", key=key)
    return {"ok": True}


@router.delete("/api-keys/{key}")
async def delete_api_key(key: str):
    """Remove DB override, falling back to .env value."""
    await config_service.delete("api_keys", key)
    logger.info("config_changed", action="delete", type="api_key", key=key)
    return {"ok": True}


def _mask_key(val: str) -> str:
    if len(val) <= 8:
        return "*" * len(val)
    return val[:3] + "*" * (len(val) - 7) + val[-4:]


# ---- Task Params ----

class TaskParamsBody(BaseModel):
    max_tokens: int = Field(default=8000, ge=1, le=200000)
    temperature: float = Field(default=0.3, ge=0, le=2)
    timeout: float = Field(default=180.0, ge=1, le=600)


@router.get("/task-params")
async def list_task_params():
    data = await config_service.get_all("task_params")
    # Merge with defaults so all tasks appear
    merged = {**DEFAULT_TASK_PARAMS}
    merged.update(data)
    return [{"task": k, **v} for k, v in merged.items()]


@router.put("/task-params/{task}")
async def update_task_params(task: str, body: TaskParamsBody):
    await config_service.upsert("task_params", task, body.model_dump())
    logger.info("config_changed", action="update", type="task_params", key=task)
    return {"ok": True}


# ---- Prompts ----

class PromptBody(BaseModel):
    template: str = Field(..., min_length=1, max_length=100000)


@router.get("/prompts")
async def list_prompts():
    data = await config_service.get_all("prompt_template")
    return [
        {
            "key": k,
            "template": v.get("template", ""),
            "variables": v.get("variables", []),
            "preview": v.get("template", "")[:200],
        }
        for k, v in data.items()
    ]


@router.get("/prompts/{key}")
async def get_prompt(key: str):
    val = await config_service.get("prompt_template", key)
    if not val:
        raise HTTPException(404, f"Prompt '{key}' not found")
    return {"key": key, "template": val.get("template", ""), "variables": val.get("variables", [])}


@router.put("/prompts/{key}")
async def update_prompt(key: str, body: PromptBody):
    existing = await config_service.get("prompt_template", key)
    if not existing:
        raise HTTPException(404, f"Prompt '{key}' not found")
    # Validate placeholders preserved
    original_vars = existing.get("variables", [])
    for var in original_vars:
        if f"{{{var}}}" not in body.template:
            raise HTTPException(400, f"Placeholder '{{{var}}}' must be preserved in template")
    await config_service.upsert("prompt_template", key, {
        "template": body.template,
        "variables": original_vars,
    })
    logger.info("config_changed", action="update", type="prompt", key=key)
    return {"ok": True}


@router.post("/prompts/{key}/reset")
async def reset_prompt(key: str):
    """Reset a single prompt to its hardcoded default."""
    from prompts.conversion import CONVERSION_PROMPT
    from prompts.slicing import CLASSIFICATION_PROMPT
    from prompts.qa import QA_PROMPT, DOC_GENERATE_PROMPT
    from prompts.challenge import CHALLENGE_QUESTION_PROMPT, CHALLENGE_JUDGE_PROMPT

    defaults = {
        "CONVERSION_PROMPT": {"template": CONVERSION_PROMPT, "variables": ["raw_text"]},
        "CLASSIFICATION_PROMPT": {"template": CLASSIFICATION_PROMPT, "variables": ["ltc_taxonomy", "industry_list", "module_list", "doc_title", "section_path", "chunk_content"]},
        "QA_PROMPT": {"template": QA_PROMPT, "variables": ["retrieved_chunks", "question"]},
        "DOC_GENERATE_PROMPT": {"template": DOC_GENERATE_PROMPT, "variables": ["template", "retrieved_chunks", "project_name", "industry"]},
        "CHALLENGE_QUESTION_PROMPT": {"template": CHALLENGE_QUESTION_PROMPT, "variables": ["target_stage", "chunks_content", "num_questions"]},
        "CHALLENGE_JUDGE_PROMPT": {"template": CHALLENGE_JUDGE_PROMPT, "variables": ["question", "answer", "source_chunks"]},
    }
    if key not in defaults:
        raise HTTPException(404, f"No default found for prompt '{key}'")
    await config_service.upsert("prompt_template", key, defaults[key])
    logger.info("config_changed", action="reset", type="prompt", key=key)
    return {"ok": True}


# ---- Utility ----

@router.post("/seed")
async def force_seed():
    await config_service.seed_defaults()
    logger.info("config_changed", action="seed", type="all")
    return {"ok": True}


@router.post("/cache/invalidate")
async def invalidate_cache():
    config_service.invalidate()
    return {"ok": True}


# ---- Skills Library ----

from models import get_session
from models.skill import Skill
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select as _select


class SkillBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    prompt_snippet: str = Field(..., min_length=1)


def _skill_out(s: Skill) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "description": s.description,
        "prompt_snippet": s.prompt_snippet,
        "created_at": s.created_at,
    }


@router.get("/skills")
async def list_skills(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(_select(Skill).order_by(Skill.created_at.asc()))).scalars().all()
    return [_skill_out(s) for s in rows]


@router.post("/skills", status_code=201)
async def create_skill(body: SkillBody, session: AsyncSession = Depends(get_session)):
    skill = Skill(
        name=body.name,
        description=body.description,
        prompt_snippet=body.prompt_snippet,
    )
    session.add(skill)
    await session.commit()
    await session.refresh(skill)
    return _skill_out(skill)


@router.put("/skills/{skill_id}")
async def update_skill(skill_id: str, body: SkillBody, session: AsyncSession = Depends(get_session)):
    skill = await session.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    skill.name = body.name
    skill.description = body.description
    skill.prompt_snippet = body.prompt_snippet
    await session.commit()
    return _skill_out(skill)


@router.delete("/skills/{skill_id}", status_code=204)
async def delete_skill(skill_id: str, session: AsyncSession = Depends(get_session)):
    skill = await session.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    await session.delete(skill)
    await session.commit()


# ---- Output Agent Configs ----

OUTPUT_AGENT_KEYS = ("kickoff_pptx", "kickoff_html", "survey", "insight")


class OutputAgentBody(BaseModel):
    prompt: str = Field(..., min_length=1)
    skill_ids: list[str] = []
    model: str | None = None


@router.get("/output-agents")
async def list_output_agents():
    data = await config_service.get_all("output_agent")
    result = []
    for key in OUTPUT_AGENT_KEYS:
        cfg = data.get(key, {})
        result.append({
            "key": key,
            "prompt": cfg.get("prompt", ""),
            "skill_ids": cfg.get("skill_ids", []),
            "model": cfg.get("model"),
        })
    return result


@router.put("/output-agents/{key}")
async def update_output_agent(key: str, body: OutputAgentBody):
    if key not in OUTPUT_AGENT_KEYS:
        raise HTTPException(400, f"Invalid output agent key. Must be one of: {OUTPUT_AGENT_KEYS}")
    await config_service.upsert("output_agent", key, {
        "prompt": body.prompt,
        "skill_ids": body.skill_ids,
        "model": body.model,
    })
    logger.info("config_changed", action="update", type="output_agent", key=key)
    return {"ok": True}


# ---- Embedding / Rerank(2026-05-28 加,运行时改不用重启) ----

class EmbRerankBody(BaseModel):
    """embedding/rerank 通用配置体:api_base / model / api_key 任填,
    传哪个改哪个;字段 key 跟 .env 里 embedding_api_base / rerank_api_base 等对齐。"""
    api_base: str | None = None
    model: str | None = None
    api_key: str | None = None


def _mask(v: str | None) -> str:
    if not v:
        return ""
    if len(v) <= 8:
        return "*" * len(v)
    return v[:3] + "*" * (len(v) - 7) + v[-4:]


async def _read_emb_rerank(section: str, base_env: str, model_env: str, key_env: str) -> dict:
    from config import settings as _settings
    out: dict = {}
    for k, env_attr in (("api_base", base_env), ("model", model_env), ("api_key", key_env)):
        cfg = await config_service.get(section, k)
        if isinstance(cfg, dict) and (cfg.get("value") or cfg.get(k)):
            val = cfg.get("value") or cfg.get(k)
            out[k] = val if k != "api_key" else _mask(val)
            out[f"{k}_source"] = "database"
            out[f"{k}_raw_set"] = True
        elif isinstance(cfg, str) and cfg.strip():
            out[k] = cfg if k != "api_key" else _mask(cfg)
            out[f"{k}_source"] = "database"
            out[f"{k}_raw_set"] = True
        else:
            raw = getattr(_settings, env_attr, "") or ""
            out[k] = raw if k != "api_key" else _mask(raw)
            out[f"{k}_source"] = "env"
            out[f"{k}_raw_set"] = bool(raw)
    return out


@router.get("/embedding")
async def get_embedding_config():
    """读 embedding 配置;api_key 返回 masked,api_base / model 明文。"""
    return await _read_emb_rerank(
        "embedding", "embedding_api_base", "embedding_model", "embedding_api_key",
    )


@router.put("/embedding")
async def update_embedding_config(body: EmbRerankBody):
    """支持局部更新:只传要改的字段。"""
    changed: list[str] = []
    if body.api_base is not None:
        await config_service.upsert("embedding", "api_base", {"value": body.api_base})
        changed.append("api_base")
    if body.model is not None:
        await config_service.upsert("embedding", "model", {"value": body.model})
        changed.append("model")
    if body.api_key is not None:
        await config_service.upsert("embedding", "api_key", {"value": body.api_key})
        changed.append("api_key")
    logger.info("config_changed", action="update", type="embedding", fields=changed)
    return {"ok": True, "changed": changed}


@router.delete("/embedding/{key}")
async def reset_embedding_config(key: str):
    """删 DB 覆盖,回退到 .env 取值。"""
    if key not in {"api_base", "model", "api_key"}:
        raise HTTPException(400, "key 只能是 api_base / model / api_key")
    await config_service.delete("embedding", key)
    logger.info("config_changed", action="delete", type="embedding", key=key)
    return {"ok": True}


@router.get("/rerank")
async def get_rerank_config():
    return await _read_emb_rerank(
        "rerank", "rerank_api_base", "rerank_model", "rerank_api_key",
    )


@router.put("/rerank")
async def update_rerank_config(body: EmbRerankBody):
    changed: list[str] = []
    if body.api_base is not None:
        await config_service.upsert("rerank", "api_base", {"value": body.api_base})
        changed.append("api_base")
    if body.model is not None:
        await config_service.upsert("rerank", "model", {"value": body.model})
        changed.append("model")
    if body.api_key is not None:
        await config_service.upsert("rerank", "api_key", {"value": body.api_key})
        changed.append("api_key")
    logger.info("config_changed", action="update", type="rerank", fields=changed)
    return {"ok": True, "changed": changed}


@router.delete("/rerank/{key}")
async def reset_rerank_config(key: str):
    if key not in {"api_base", "model", "api_key"}:
        raise HTTPException(400, "key 只能是 api_base / model / api_key")
    await config_service.delete("rerank", key)
    logger.info("config_changed", action="delete", type="rerank", key=key)
    return {"ok": True}
