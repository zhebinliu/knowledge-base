"""SlowAPI limiter 单例。按 IP 限流，生产侧可改 header/user 粒度。"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
