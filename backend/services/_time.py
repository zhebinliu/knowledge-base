"""统一的时间工具 — 所有 model / service / agent 用这一份。

历史:之前 20+ 文件各自定义 `def _utcnow(): return datetime.now(timezone.utc).replace(tzinfo=None)`,
2026-05 整合到这里。

约定:
- DB 列默认 `DateTime`(无时区),写入用 naive UTC datetime — 与 PG 列定义一致
- 不要直接用 `datetime.utcnow()`(Python 3.12 起 deprecated)
- 不要直接用 `datetime.now()` 不带 tz — 各机器时区不同会出错

只导出 `utcnow_naive()` 一个函数,语义就是"现在的 UTC 时间,但去掉 tzinfo 字段"。
"""
from datetime import datetime, timezone


def utcnow_naive() -> datetime:
    """返回当前 UTC 时间,去掉 tzinfo(naive datetime)— 用于 SQLAlchemy `DateTime` 列写入。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)
