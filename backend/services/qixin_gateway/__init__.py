"""企信 IM Gateway 1.3 接入(2026-05-29)。

子模块:
- sse_client:单 Bot 长连接(连/重连/Last-Event-ID 续传/max_lifetime 主动重连)
- connection_manager:按 user_id 维护连接池,挂在 FastAPI 主进程

协议参考 openclaw-sharecrm(MIT licensed)的 client.ts 实现,
我们用 httpx 重写一份 Python 版,不引入 OpenClaw 框架。
"""
