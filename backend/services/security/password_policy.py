"""密码强度策略 — 注册 / 修改密码统一调。

规则:
- 长度 ≥ 10
- 含大写字母 (A-Z)
- 含小写字母 (a-z)
- 含数字 (0-9)
- 含特殊字符 (`!@#$%^&*()_+-=[]{};':",.<>?/\\|~ ` 等可见 ASCII 标点)
- 不等于用户名(case-insensitive)
"""
from __future__ import annotations

import string

MIN_LENGTH = 10
SPECIALS = set(string.punctuation + " ")  # 含空格,但不强烈推荐空格


def validate_password_strength(password: str, *, username: str | None = None) -> tuple[bool, str]:
    """返回 (ok, reason)。reason 失败时给具体原因(给前端展示),成功时为空字符串。"""
    if not isinstance(password, str):
        return False, "密码格式无效"
    if len(password) < MIN_LENGTH:
        return False, f"密码至少 {MIN_LENGTH} 位"
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = any(c in SPECIALS for c in password)

    missing = []
    if not has_upper:
        missing.append("大写字母")
    if not has_lower:
        missing.append("小写字母")
    if not has_digit:
        missing.append("数字")
    if not has_special:
        missing.append("特殊字符")
    if missing:
        return False, "密码必须包含:" + " / ".join(missing)

    if username and password.lower() == username.lower():
        return False, "密码不能与用户名相同"

    return True, ""


def evaluate_password_checks(password: str, *, username: str | None = None) -> dict:
    """前端实时强度提示用 — 返回每条规则是否通过(供 UI 标记 ✓ / ✗)。"""
    return {
        "length": len(password) >= MIN_LENGTH,
        "upper": any(c.isupper() for c in password),
        "lower": any(c.islower() for c in password),
        "digit": any(c.isdigit() for c in password),
        "special": any(c in SPECIALS for c in password),
        "not_username": (not username) or password.lower() != username.lower(),
    }
