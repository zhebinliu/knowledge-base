"""Helper to record API/MCP calls asynchronously (fire-and-forget)."""
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
    """Non-blocking fire-and-forget log write."""
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(_write_log(user_id, username, token_type, call_type, endpoint, status_code))
    except Exception:
        pass
