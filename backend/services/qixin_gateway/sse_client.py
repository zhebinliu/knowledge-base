"""企信 IM Gateway 1.3 SSE 客户端(2026-05-29)。

协议(参考 openclaw-sharecrm/client.ts):
- 鉴权:POST {gateway}/im-gateway/auth/token  body={appId, appSecret}
        → {code:0, data:{accessToken, expiresIn, tokenType:"Bearer"}}
- 收消息:GET {gateway}/im-gateway/bot/events?token=&version=1.3.0
        - Accept: text/event-stream
        - Last-Event-ID: <id>(重连续传)
        - 事件类型:connected / message / reset / error
        - 心跳走 SSE comment(`:` 开头),自动忽略
        - 服务端可下发 retry:<ms> 控制重连间隔
        - connected.data.max_lifetime 到期主动重连(避免 Gateway 强切)
- 发消息:POST {gateway}/im-gateway/qixin/message/send
        Header: Authorization: Bearer <token>
        Body: {chat_id, text, reply_message_id?}(Phase 2 启用)

每个 Bot 一条独立 SSE,由 connection_manager 起 asyncio task 跑。
"""
from __future__ import annotations

import asyncio
import json
import random
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

import httpx
import structlog

logger = structlog.get_logger()

PROTOCOL_VERSION = "1.3.0"
DEFAULT_RECONNECT_DELAY_MS = 1000
IMMEDIATE_RECONNECT_DELAY_MS = 50
MAX_RECONNECT_DELAY_MS = 30_000
TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000  # 提前 5min 刷新
MAX_LIFETIME_BUFFER_MS = 5_000  # max_lifetime - 5s 主动重连

OnMessage = Callable[[dict], Awaitable[None]]
OnConnected = Callable[[dict], Awaitable[None]]
OnError = Callable[[Exception], Awaitable[None]]


@dataclass
class QixinSSEClient:
    """单 Bot SSE 长连接。

    调用方:`asyncio.create_task(client.run())` 启动;`client.stop()` 优雅退出。
    """
    user_id: str
    app_id: str
    app_secret: str
    gateway_base_url: str
    on_message: OnMessage
    on_connected: Optional[OnConnected] = None
    on_error: Optional[OnError] = None

    _stop: bool = field(default=False, init=False)
    _exit_stream: bool = field(default=False, init=False)
    _access_token: Optional[str] = field(default=None, init=False)
    _token_expires_at_ms: float = field(default=0.0, init=False)
    _last_event_id: Optional[str] = field(default=None, init=False)
    _reconnect_delay_ms: int = field(default=DEFAULT_RECONNECT_DELAY_MS, init=False)
    _reconnect_attempts: int = field(default=0, init=False)
    _max_lifetime_deadline: Optional[float] = field(default=None, init=False)

    def stop(self) -> None:
        self._stop = True

    async def run(self) -> None:
        """长跑 — 连一次 → 监听 → 断开重连,直到 stop()。"""
        while not self._stop:
            try:
                await self._connect_once()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning("qixin_sse_loop_error", user_id=self.user_id, error=str(e))
                if self.on_error:
                    try:
                        await self.on_error(e)
                    except Exception:
                        pass
            if self._stop:
                break
            await self._wait_before_reconnect()

    async def _wait_before_reconnect(self) -> None:
        backoff_ms = min(
            self._reconnect_delay_ms * (2 ** self._reconnect_attempts),
            MAX_RECONNECT_DELAY_MS,
        )
        jitter = 1 + random.random() * 0.2
        wait_ms = int(backoff_ms * jitter)
        logger.info(
            "qixin_sse_reconnect_wait",
            user_id=self.user_id,
            wait_ms=wait_ms,
            attempt=self._reconnect_attempts,
        )
        self._reconnect_attempts += 1
        await asyncio.sleep(wait_ms / 1000.0)

    async def _ensure_token(self, client: httpx.AsyncClient) -> str:
        now_ms = time.time() * 1000
        if self._access_token and now_ms < self._token_expires_at_ms:
            return self._access_token
        url = f"{self.gateway_base_url.rstrip('/')}/im-gateway/auth/token"
        resp = await client.post(url, json={"appId": self.app_id, "appSecret": self.app_secret})
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0 or not data.get("data"):
            raise RuntimeError(f"获取 Token 失败: {data.get('msg', 'unknown')}")
        token = data["data"]["accessToken"]
        expires_in = int(data["data"].get("expiresIn", 3600))
        self._access_token = token
        self._token_expires_at_ms = now_ms + expires_in * 1000 - TOKEN_REFRESH_BUFFER_MS
        return token

    async def _connect_once(self) -> None:
        """单次 SSE 连接 + 监听;返回即进入外层重连。"""
        timeout = httpx.Timeout(connect=15.0, read=None, write=15.0, pool=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            token = await self._ensure_token(client)
            sse_url = f"{self.gateway_base_url.rstrip('/')}/im-gateway/bot/events"
            params = {"token": token, "version": PROTOCOL_VERSION}
            headers = {"Accept": "text/event-stream", "Cache-Control": "no-cache"}
            if self._last_event_id:
                headers["Last-Event-ID"] = self._last_event_id

            logger.info("qixin_sse_connecting", user_id=self.user_id, url=sse_url)
            async with client.stream("GET", sse_url, params=params, headers=headers) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    logger.warning(
                        "qixin_sse_bad_status",
                        user_id=self.user_id,
                        status=resp.status_code,
                        body_preview=body[:300].decode("utf-8", errors="replace"),
                    )
                    # 401/403 多半 token 失效,清掉强制下轮重新拉
                    if resp.status_code in (401, 403):
                        self._access_token = None
                        self._token_expires_at_ms = 0
                    return
                await self._read_stream(resp)

    async def _read_stream(self, resp: httpx.Response) -> None:
        """逐行读 SSE,双 \\n 切 event block;遇 max_lifetime/reset 退出 → 外层重连。"""
        buffer = ""
        self._exit_stream = False
        self._max_lifetime_deadline = None

        async for chunk in resp.aiter_text():
            if self._stop or self._exit_stream:
                return
            buffer += chunk.replace("\r\n", "\n")
            while "\n\n" in buffer:
                block, buffer = buffer.split("\n\n", 1)
                parsed = self._parse_block(block)
                if parsed is not None:
                    await self._dispatch_event(parsed)
                if self._exit_stream or self._stop:
                    return
            if self._max_lifetime_deadline and time.monotonic() > self._max_lifetime_deadline:
                logger.info("qixin_sse_max_lifetime_reached", user_id=self.user_id)
                return

    @staticmethod
    def _parse_block(block: str) -> Optional[dict]:
        """单 SSE block → {event, data, id?, retry?};comment/empty → None。"""
        event_name = "message"
        data_lines: list[str] = []
        ev_id: Optional[str] = None
        retry_ms: Optional[int] = None
        for line in block.split("\n"):
            if not line or line.startswith(":"):
                continue
            if line.startswith("event:"):
                event_name = line[6:].strip()
            elif line.startswith("data:"):
                # SSE 规范:data: 后只去掉一个前导空格
                data_lines.append(line[5:].lstrip(" "))
            elif line.startswith("id:"):
                ev_id = line[3:].strip()
            elif line.startswith("retry:"):
                try:
                    val = int(line[6:].strip())
                    if val >= 0:
                        retry_ms = val
                except ValueError:
                    pass
        if not data_lines:
            return None
        return {
            "event": event_name,
            "data": "\n".join(data_lines),
            "id": ev_id,
            "retry": retry_ms,
        }

    async def _dispatch_event(self, parsed: dict) -> None:
        """分发 connected/message/reset/error。"""
        if parsed["retry"] is not None:
            self._reconnect_delay_ms = parsed["retry"]
        if parsed["id"]:
            self._last_event_id = parsed["id"]

        try:
            msg: dict[str, Any] = json.loads(parsed["data"])
        except json.JSONDecodeError as e:
            logger.warning(
                "qixin_sse_parse_failed",
                user_id=self.user_id,
                event=parsed["event"],
                error=str(e),
                raw_preview=parsed["data"][:200],
            )
            return

        msg_type = msg.get("type")
        if msg_type == "connected":
            self._reconnect_attempts = 0
            data = msg.get("data") or {}
            if isinstance(data.get("retry"), (int, float)) and data["retry"] >= 0:
                self._reconnect_delay_ms = int(data["retry"])
            max_lifetime = data.get("max_lifetime")
            logger.info(
                "qixin_sse_connected",
                user_id=self.user_id,
                bot_full_id=data.get("bot_full_id"),
                max_lifetime=max_lifetime,
            )
            if self.on_connected:
                try:
                    await self.on_connected(data)
                except Exception as e:
                    logger.error("qixin_on_connected_failed", user_id=self.user_id, error=str(e))
            if isinstance(max_lifetime, (int, float)) and max_lifetime > 0:
                self._max_lifetime_deadline = (
                    time.monotonic() + (max_lifetime - MAX_LIFETIME_BUFFER_MS) / 1000.0
                )

        elif msg_type == "message":
            try:
                await self.on_message(msg)
            except Exception as e:
                logger.error("qixin_on_message_failed", user_id=self.user_id, error=str(e))

        elif msg_type == "reset":
            reason = msg.get("reason", "unknown")
            logger.warning("qixin_sse_reset", user_id=self.user_id, reason=reason)
            self._last_event_id = None
            self._reconnect_delay_ms = IMMEDIATE_RECONNECT_DELAY_MS
            self._reconnect_attempts = 0
            self._exit_stream = True  # 退出 → 外层立即重连

        elif msg_type == "error":
            err = msg.get("error") or {}
            logger.warning(
                "qixin_sse_event_error",
                user_id=self.user_id,
                code=err.get("code"),
                err_message=err.get("message"),
            )
