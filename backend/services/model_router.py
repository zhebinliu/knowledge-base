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
import inspect
import re
import time
import structlog
import httpx
from config import settings


def _detect_caller_module(skip_modules: tuple = ("services.model_router",)) -> str | None:
    """走栈找第一个不在 skip_modules 里的调用方模块名。

    用法:在 chat()/chat_with_tools() 进入时调用,
    返回如 "api.meeting" / "agents.slicer_agent"。
    """
    try:
        for frame_info in inspect.stack()[1:8]:
            mod_name = frame_info.frame.f_globals.get("__name__", "")
            if not mod_name:
                continue
            if any(mod_name == s or mod_name.startswith(s + ".") for s in skip_modules):
                continue
            return mod_name
    except Exception:
        return None
    return None

# 匹配推理模型输出的 <think>...</think> 思考块（跨行）
_THINK_RE = re.compile(r"<think>[\s\S]*?</think>", re.IGNORECASE)


def _strip_think(text: str) -> str:
    """去除推理模型输出的 <think>...</think> 思考块。完整闭合的块直接删。
    若仅有 <think> 无 </think>（极少见被截断），也删掉 <think> 之后的所有内容。
    """
    if not text:
        return text
    cleaned = _THINK_RE.sub("", text)
    idx = cleaned.lower().find("<think>")
    if idx != -1:
        cleaned = cleaned[:idx]
    return cleaned.strip()

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
        # 视觉 OCR 走小米官方 endpoint(跟 chat 走的 token-plan-cn 代理是两条线)
        # auth_header_style:小米 vision 端点要求 header 用 "api-key: xxx",不是 Bearer
        # max_tokens_field:小米 vision payload 用 max_completion_tokens
        "vision_endpoint": "https://api.xiaomimimo.com/v1/chat/completions",
        "auth_header_style": "api-key",
        "max_tokens_field": "max_completion_tokens",
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
    # ── 会议 (Meeting) ──────────────────────────────────────────────────────
    # 转写润色:把 ASR 输出的口语化文本整理成规整文字,需要语言能力强
    "meeting_transcript_polish":   {"primary": "minimax-m2.7",      "fallback": "glm-5"},
    # 纪要 JSON 抽取(摘要/议题/决议/待办):结构化生成,要严谨
    "meeting_minutes_extract":     {"primary": "minimax-m2.7",      "fallback": "glm-5"},
    # 需求抽取:从纪要找 P0-P3 需求,结构化标注
    "meeting_requirements_extract":{"primary": "minimax-m2.5",      "fallback": "mimo-v2-pro"},
    # 流程识别:从会议转写提取业务流程并生成 Mermaid 流程图
    "meeting_process_flows_extract":{"primary": "minimax-m2.5",      "fallback": "mimo-v2-pro"},
    # 干系人图谱抽取:从纪要识别人物 + 组织关系
    "meeting_stakeholders_extract":{"primary": "minimax-m2.7",      "fallback": "glm-5"},
    # 会议内容问答:用户在 console 问会议,长上下文 + 高质量
    "meeting_qa_answer":           {"primary": "minimax-m2.7",      "fallback": "glm-5"},
    # 解释图 prompt 生成:从会议内容提取认知锚点并生成图像 prompt
    "meeting_illustrations_extract":{"primary": "minimax-m2.7",      "fallback": "glm-5"},
    # 纪要模板演化:基于历史样本归纳模板,元分析任务
    "meeting_template_evolve":     {"primary": "minimax-m2.7",      "fallback": "glm-5"},

    # ── 文档 (Document) ─────────────────────────────────────────────────────
    # 原始文本 → markdown:分段转写,吞吐量大
    "doc_markdown_convert":        {"primary": "minimax-m2.5",      "fallback": "mimo-v2-pro"},
    # 转换后 markdown 复核(对比 raw_text 找漏抽 / 错位)— review 模型
    "doc_markdown_refine":         {"primary": "glm-5",             "fallback": "minimax-m2.5"},
    # 切片分类(LTC stage / industry / module)
    "doc_section_slice":           {"primary": "minimax-m2.5",      "fallback": "mimo-v2-pro"},
    # 低置信切片复审:取速度 > 质量
    "doc_section_review_lowconf":  {"primary": "minimax-m2.7",      "fallback": "minimax-m2.5"},
    # 文档级摘要 + FAQ 生成
    "doc_summary_faq":             {"primary": "minimax-m2.7",      "fallback": "glm-5"},
    # 文档类型推断(sow / 方案 / 合同等)
    "doc_type_classify":           {"primary": "minimax-m2.5",      "fallback": "mimo-v2-pro"},
    # 金额抽取(脱敏用)
    "doc_amount_extraction":       {"primary": "minimax-m2.5",      "fallback": "mimo-v2-pro"},
    # 扫描件 PDF / 图像 OCR — vision 模型直接看图
    "pdf_ocr":                     {"primary": "mimo-v2-omni",      "fallback": "mimo-v2-omni"},

    # ── 知识库问答 (KB Q&A) ──────────────────────────────────────────────────
    # 普通 KB 问答
    "kb_qa_answer":                {"primary": "qwen3-next-80b-a3b", "fallback": "glm-5"},
    # 流式 KB 问答(同步首字延迟更重要,可换轻量模型)
    "kb_qa_answer_stream":         {"primary": "qwen3-next-80b-a3b", "fallback": "glm-5"},
    # 基于 KB chunk 生成文档片段
    "kb_doc_generate":             {"primary": "minimax-m2.7",      "fallback": "glm-5"},

    # ── 项目 & 输出 (Project / Output) ──────────────────────────────────────
    # 客户画像生成
    "project_audience_profile":    {"primary": "minimax-m2.7",      "fallback": "glm-5"},
    # 通用输出文档生成(insight / survey / proposal)
    "output_doc_generate":         {"primary": "minimax-m2.7",      "fallback": "glm-5"},
    # 启动会 PPT 的 python-pptx 代码生成 — mimo 推理+代码强,但 token 紧张时回落 glm-5(2026-06-03 加)
    "kickoff_pptx_codegen":        {"primary": "mimo-v2-pro",       "fallback": "glm-5"},

    # ── 挑战练习 (Challenge) ────────────────────────────────────────────────
    # 基于 KB chunk 出题
    "challenge_question_kb":       {"primary": "mimo-v2-pro",       "fallback": "glm-5"},
    # 自由出题(无 KB)
    "challenge_question_freeform": {"primary": "mimo-v2-pro",       "fallback": "glm-5"},
    # 答题判分
    "challenge_answer_judge":      {"primary": "glm-5",             "fallback": "qwen3-next-80b-a3b"},
    # 判分输出 JSON 修复(recovery)
    "challenge_verdict_reformat":  {"primary": "glm-5",             "fallback": "minimax-m2.5"},
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
        max_tokens: int | None = 8000,
        temperature: float = 0.3,
        response_format: dict | None = None,
        timeout: float = 180.0,
        strip_think: bool = True,                 # 推理模型 think 块默认剥;
                                                   # 调用方需要原始内容(JSON 抽取/debug)时传 False
        _log_task: str | None = None,             # 仅供 logging 用,不进 payload
        _log_caller: str | None = None,
    ) -> tuple[str, str]:
        """Returns (content, model_name) tuple. Retries on 429 with exponential backoff.
        max_tokens=None 时不下发该字段，由模型按自身 max 输出。"""
        from services.call_log_service import log_llm_call

        config = await self._get_model_config(model_name)
        api_key = await self._get_api_key(config)
        caller_module = _log_caller or _detect_caller_module()
        t0 = time.monotonic()

        payload: dict = {
            "model": config["model_id"],
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        if response_format:
            payload["response_format"] = response_format

        # 退避策略(2026-05-12 改进):
        #   - 429 / 5xx / 网络超时 / 连接错误 都退避重试,直到三轮失败
        #   - 其他 4xx(401/403/400 等)是配置错误,立即 raise 触发上层 fallback
        backoffs = [5, 10, 20]
        attempt = 0
        last_status: int | None = None
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
                last_status = resp.status_code
                # 429 + 5xx:可重试
                if resp.status_code in (429,) or 500 <= resp.status_code < 600:
                    if attempt < len(backoffs):
                        wait = backoffs[attempt]
                        attempt += 1
                        logger.warning("model_call_retrying", model=model_name, status=resp.status_code, attempt=attempt, wait_s=wait)
                        await asyncio.sleep(wait)
                        continue
                resp.raise_for_status()
                self._failure_counts[model_name] = 0
                body = resp.json()
                content = body["choices"][0]["message"]["content"]
                usage = body.get("usage") or {}
                if strip_think:
                    # 统一剥离 <think>...</think> 思考块,避免污染下游解析/展示
                    content = _strip_think(content)
                # 成功日志(fire-and-forget)
                log_llm_call(
                    model_name=model_name,
                    caller_module=caller_module,
                    task=_log_task,
                    input_tokens=usage.get("prompt_tokens"),
                    output_tokens=usage.get("completion_tokens"),
                    duration_ms=int((time.monotonic() - t0) * 1000),
                    status_code=last_status,
                )
                return content, model_name
            except httpx.HTTPStatusError as e:
                # 退避用完仍失败,或非可重试 4xx
                self._failure_counts[model_name] = self._failure_counts.get(model_name, 0) + 1
                logger.error("model_call_failed", model=model_name, status=e.response.status_code, error=str(e)[:200])
                log_llm_call(
                    model_name=model_name, caller_module=caller_module, task=_log_task,
                    input_tokens=None, output_tokens=None,
                    duration_ms=int((time.monotonic() - t0) * 1000),
                    status_code=e.response.status_code, error_message=str(e)[:500],
                )
                raise
            except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError) as e:
                # 网络层异常:同样可重试
                if attempt < len(backoffs):
                    wait = backoffs[attempt]
                    attempt += 1
                    logger.warning("model_call_network_retrying", model=model_name, error=type(e).__name__, attempt=attempt, wait_s=wait)
                    await asyncio.sleep(wait)
                    continue
                self._failure_counts[model_name] = self._failure_counts.get(model_name, 0) + 1
                logger.error("model_call_network_failed", model=model_name, error=type(e).__name__)
                log_llm_call(
                    model_name=model_name, caller_module=caller_module, task=_log_task,
                    input_tokens=None, output_tokens=None,
                    duration_ms=int((time.monotonic() - t0) * 1000),
                    status_code=None, error_message=f"{type(e).__name__}: {str(e)[:400]}",
                )
                raise
            except Exception as e:
                self._failure_counts[model_name] = self._failure_counts.get(model_name, 0) + 1
                logger.error("model_call_failed", model=model_name, error=str(e)[:200] or type(e).__name__)
                log_llm_call(
                    model_name=model_name, caller_module=caller_module, task=_log_task,
                    input_tokens=None, output_tokens=None,
                    duration_ms=int((time.monotonic() - t0) * 1000),
                    status_code=last_status, error_message=f"{type(e).__name__}: {str(e)[:400]}",
                )
                raise

    async def chat_with_tools(
        self,
        model_name: str,
        messages: list[dict],
        tools: list[dict],
        tool_choice: str | dict = "auto",
        max_tokens: int = 4000,
        temperature: float = 0.3,
        timeout: float = 180.0,
        _log_task: str | None = None,
        _log_caller: str | None = None,
    ) -> dict:
        """OpenAI 兼容的工具调用。返回 {"content": str|None, "tool_calls": [...], "model": str, "finish_reason": str}。"""
        from services.call_log_service import log_llm_call

        config = await self._get_model_config(model_name)
        api_key = await self._get_api_key(config)
        caller_module = _log_caller or _detect_caller_module()
        t0 = time.monotonic()

        payload: dict = {
            "model": config["model_id"],
            "messages": messages,
            "tools": tools,
            "tool_choice": tool_choice,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        backoffs = [5, 10, 20]
        attempt = 0
        last_status: int | None = None
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
                last_status = resp.status_code
                if resp.status_code == 429 and attempt < len(backoffs):
                    wait = backoffs[attempt]
                    attempt += 1
                    logger.warning("rate_limited_retrying", model=model_name, attempt=attempt, wait_s=wait)
                    await asyncio.sleep(wait)
                    continue
                resp.raise_for_status()
                self._failure_counts[model_name] = 0
                body = resp.json()
                data = body["choices"][0]
                msg = data.get("message") or {}
                content = msg.get("content")
                if isinstance(content, str):
                    content = _strip_think(content)
                usage = body.get("usage") or {}
                log_llm_call(
                    model_name=model_name, caller_module=caller_module, task=_log_task,
                    input_tokens=usage.get("prompt_tokens"),
                    output_tokens=usage.get("completion_tokens"),
                    duration_ms=int((time.monotonic() - t0) * 1000),
                    status_code=last_status,
                )
                return {
                    "content": content,
                    "tool_calls": msg.get("tool_calls") or [],
                    "model": model_name,
                    "finish_reason": data.get("finish_reason") or "",
                }
            except httpx.HTTPStatusError as e:
                self._failure_counts[model_name] = self._failure_counts.get(model_name, 0) + 1
                body = ""
                try:
                    body = e.response.text[:400]
                except Exception:
                    pass
                logger.error("tools_call_failed", model=model_name, status=e.response.status_code, body=body)
                log_llm_call(
                    model_name=model_name, caller_module=caller_module, task=_log_task,
                    input_tokens=None, output_tokens=None,
                    duration_ms=int((time.monotonic() - t0) * 1000),
                    status_code=e.response.status_code, error_message=str(e)[:500],
                )
                raise
            except Exception as e:
                self._failure_counts[model_name] = self._failure_counts.get(model_name, 0) + 1
                logger.error("tools_call_failed", model=model_name, error=str(e)[:200] or type(e).__name__)
                log_llm_call(
                    model_name=model_name, caller_module=caller_module, task=_log_task,
                    input_tokens=None, output_tokens=None,
                    duration_ms=int((time.monotonic() - t0) * 1000),
                    status_code=last_status, error_message=f"{type(e).__name__}: {str(e)[:400]}",
                )
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
        # 让 chat() 记日志时知道 task / 真实 caller(不能让 chat() 自己 inspect 到 model_router)
        merged.setdefault("_log_task", task)
        merged.setdefault("_log_caller", _detect_caller_module())

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
        _log_task: str | None = None,
        _log_caller: str | None = None,
    ):
        """Async generator yielding (token, None) during streaming, then (None, model_name) at end.

        日志:流式拿不到 prompt_tokens / completion_tokens(除非服务端在 [DONE] 前
        push 一个含 usage 的 chunk),这里尽力捕获,捕不到也写一行只记 duration。
        """
        import json as _json
        from services.call_log_service import log_llm_call

        config = await self._get_model_config(model_name)
        api_key = await self._get_api_key(config)
        caller_module = _log_caller or _detect_caller_module()
        t0 = time.monotonic()
        usage_captured: dict = {}
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
                        log_llm_call(
                            model_name=model_name, caller_module=caller_module, task=_log_task,
                            input_tokens=usage_captured.get("prompt_tokens"),
                            output_tokens=usage_captured.get("completion_tokens"),
                            duration_ms=int((time.monotonic() - t0) * 1000),
                            status_code=200,
                        )
                        yield None, model_name
                        return
                    try:
                        chunk = _json.loads(data)
                        # 部分 provider 会在 stream 末尾 push 一个含 usage 的 chunk
                        if isinstance(chunk.get("usage"), dict):
                            usage_captured = chunk["usage"]
                        delta = chunk["choices"][0]["delta"].get("content") or ""
                        if delta:
                            yield delta, None
                    except Exception:
                        pass
        except Exception as e:
            self._failure_counts[model_name] = self._failure_counts.get(model_name, 0) + 1
            logger.error("stream_failed", model=model_name, error=str(e)[:200])
            log_llm_call(
                model_name=model_name, caller_module=caller_module, task=_log_task,
                input_tokens=None, output_tokens=None,
                duration_ms=int((time.monotonic() - t0) * 1000),
                status_code=None, error_message=f"{type(e).__name__}: {str(e)[:400]}",
            )
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
        kwargs.setdefault("_log_task", task)
        kwargs.setdefault("_log_caller", _detect_caller_module())

        try:
            async for token, model in self.chat_stream(primary, messages, **kwargs):
                yield token, model
        except Exception as e:
            logger.warning("stream_falling_back", task=task, primary=primary, fallback=fallback, reason=str(e)[:100])
            async for token, model in self.chat_stream(fallback, messages, **kwargs):
                yield token, model

    async def generate_image(
        self,
        prompt: str,
        width: int = 1792,
        height: int = 1024,
        timeout: float = 120.0,
    ) -> str:
        """调用 MiniMax 文生图 API,返回 base64 图片数据(data URL)。

        使用已有的 minimax_api_key,endpoint 为 api.minimax.chat/v1/images/generations。
        """
        from services.call_log_service import log_llm_call

        api_key = getattr(settings, "minimax_api_key", "")
        if not api_key:
            raise RuntimeError("minimax_api_key 未配置,无法生成图像")

        t0 = time.monotonic()
        backoffs = [10, 20, 30]
        attempt = 0
        last_status: int | None = None

        while True:
            try:
                logger.info("image_gen_request", prompt_len=len(prompt),
                            width=width, height=height, attempt=attempt)
                resp = await self.client.post(
                    "https://api.minimax.chat/v1/images/generations",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "image-01",
                        "prompt": prompt,
                        "n": 1,
                        "width": width,
                        "height": height,
                    },
                    timeout=timeout,
                )
                last_status = resp.status_code
                logger.info("image_gen_response", status=resp.status_code)
                if resp.status_code in (429,) or 500 <= resp.status_code < 600:
                    if attempt < len(backoffs):
                        wait = backoffs[attempt]
                        attempt += 1
                        logger.warning("image_gen_retrying", status=resp.status_code, attempt=attempt, wait_s=wait)
                        await asyncio.sleep(wait)
                        continue
                resp.raise_for_status()
                body = resp.json()

                # MiniMax 返回格式: { "data": [{ "b64_json": "...", "url": "..." }] }
                images = body.get("data") or []
                if not images:
                    raise RuntimeError(f"MiniMax 图像生成返回空结果: {body}")

                img = images[0]
                b64 = img.get("b64_json")
                url = img.get("url")

                if b64:
                    result = f"data:image/png;base64,{b64}"
                elif url:
                    result = url
                else:
                    raise RuntimeError(f"MiniMax 图像生成无有效数据: {img}")

                log_llm_call(
                    model_name="minimax-image-01",
                    caller_module=_detect_caller_module(),
                    task="image_generation",
                    input_tokens=None,
                    output_tokens=None,
                    duration_ms=int((time.monotonic() - t0) * 1000),
                    status_code=last_status,
                )
                return result

            except httpx.HTTPStatusError as e:
                body_text = ""
                try:
                    body_text = e.response.text[:500]
                except Exception:
                    pass
                logger.error("image_gen_failed", status=e.response.status_code,
                             error=str(e)[:200], response_body=body_text)
                log_llm_call(
                    model_name="minimax-image-01", caller_module=_detect_caller_module(),
                    task="image_generation",
                    input_tokens=None, output_tokens=None,
                    duration_ms=int((time.monotonic() - t0) * 1000),
                    status_code=e.response.status_code, error_message=f"{str(e)[:200]} | body: {body_text[:300]}",
                )
                raise
            except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError) as e:
                if attempt < len(backoffs):
                    wait = backoffs[attempt]
                    attempt += 1
                    logger.warning("image_gen_network_retrying", error=type(e).__name__, attempt=attempt, wait_s=wait)
                    await asyncio.sleep(wait)
                    continue
                logger.error("image_gen_network_failed", error=type(e).__name__)
                raise

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
