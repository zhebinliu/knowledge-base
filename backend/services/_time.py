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


def iso_utc(dt: datetime | None) -> str | None:
    """把存库的 naive UTC datetime 序列化成 ISO 字符串(带 +00:00 后缀)。

    主要给"手动构造 DTO 时直接 isoformat()"的老代码用 — 比如:
        "created_at": p.created_at.isoformat() if p.created_at else None
    问题是 naive datetime 直接 isoformat() 拿到的串没 tz 后缀,JS new Date()
    当本地时间解析,在 UTC+8 机器上前端就显示成"8 小时前"。

    main.py 已经 patch 了 fastapi.encoders.ENCODERS_BY_TYPE[datetime],
    所以**新代码直接塞 datetime 对象就行**;只有遗留的 .isoformat() 调用要换成这个。
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()
