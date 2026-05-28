"""Helper to record API/MCP/LLM calls asynchronously (fire-and-forget).

2026-05-28 加 log_llm_call() — model_router 每次调完大模型都打一行。
"""
import asyncio
import structlog
from models import async_session_maker
from models.api_call_log import ApiCallLog

logger = structlog.get_logger()


async def _write_log(
    user_id: str | None,
    username: str | None,
    token_type: str,
    call_type: str,
    endpoint: str,
    status_code: int | None = None,
    *,
    model_name: str | None = None,
    caller_module: str | None = None,
    task: str | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    duration_ms: int | None = None,
    error_message: str | None = None,
):
    try:
        async with async_session_maker() as session:
            session.add(ApiCallLog(
                user_id=user_id,
                username=username,
                token_type=token_type,
                call_type=call_type,
                endpoint=endpoint,
                status_code=status_code,
                model_name=model_name,
                caller_module=caller_module,
                task=task,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                duration_ms=duration_ms,
                error_message=error_message,
            ))
            await session.commit()
    except Exception as e:
        logger.warning("call_log_write_failed", error=str(e)[:100])


def log_call(
    user_id: str | None,
    username: str | None,
    token_type: str,
    call_type: str,
    endpoint: str,
    status_code: int | None = None,
):
    """Non-blocking fire-and-forget log write (REST / MCP)."""
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(_write_log(user_id, username, token_type, call_type, endpoint, status_code))
    except Exception:
        pass


def log_llm_call(
    *,
    model_name: str,
    caller_module: str | None,
    task: str | None,
    input_tokens: int | None,
    output_tokens: int | None,
    duration_ms: int | None,
    status_code: int | None,
    error_message: str | None = None,
):
    """Non-blocking 大模型调用日志。

    - endpoint 字段复用为模型名(便于在统一 log 视图按 endpoint 列展示)
    - user_id / username 留空:LLM 调用是系统内部行为,跟登录态不绑
    - token_type='system' 区分跟 mcp_key / jwt
    """
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(_write_log(
            user_id=None,
            username=None,
            token_type="system",
            call_type="llm",
            endpoint=model_name,
            status_code=status_code,
            model_name=model_name,
            caller_module=caller_module,
            task=task,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            duration_ms=duration_ms,
            error_message=error_message,
        ))
    except Exception:
        pass
