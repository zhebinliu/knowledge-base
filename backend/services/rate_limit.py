"""SlowAPI limiter 单例。按 IP 限流。

2026-05-12 修复:此前用 `get_remote_address` 看到的是 nginx 容器 IP(全部请求并到一个桶),
等于限流形同虚设。现在优先取 X-Forwarded-For 第一段,回退 X-Real-IP,再回退 remote_address。
"""
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _real_client_ip(request: Request) -> str:
    # 优先 X-Forwarded-For 首段(nginx 已配 `proxy_set_header X-Forwarded-For ...`)
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        # 头形如 "client, proxy1, proxy2";取第一段
        client = xff.split(",")[0].strip()
        if client:
            return client
    xri = request.headers.get("x-real-ip", "").strip()
    if xri:
        return xri
    return get_remote_address(request)


limiter = Limiter(key_func=_real_client_ip)
