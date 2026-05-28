"""飞书 App Secret 加解密模块(2026-05-28)。

使用 Fernet 对称加密存储 App Secret,避免明文泄露。
Fernet key 从 Settings.fernet_key 读取,未配置时启动时自动生成并警告(仅开发环境安全)。
"""
from __future__ import annotations

from cryptography.fernet import Fernet
import structlog

logger = structlog.get_logger()

# 延迟初始化,避免循环导入
_fernet: Fernet | None = None
_key: str = ""


def _init_fernet() -> Fernet:
    """初始化 Fernet 实例(幂等)。"""
    global _fernet, _key
    if _fernet is not None:
        return _fernet

    from config import settings
    key = settings.fernet_key.strip()
    if not key:
        # 未配置 FERNET_KEY:自动生成临时 key(仅适合开发/单机)
        key = Fernet.generate_key().decode()
        logger.warning(
            "fernet_key_not_configured",
            msg="FERNET_KEY 未在 .env 中配置,已自动生成临时 key。"
                 "生产环境请在 .env 中设置 FERNET_KEY=<固定值>,否则重启后旧密文将无法解密!",
        )
    else:
        # 确保 key 是合法的 Fernet key(32 url-safe base64 编码)
        try:
            Fernet(key.encode())
        except Exception:
            logger.error(
                "fernet_key_invalid",
                msg="FERNET_KEY 格式无效,需要 32 字节 url-safe base64 编码。已回退到自动生成。",
            )
            key = Fernet.generate_key().decode()
    _key = key
    _fernet = Fernet(_key.encode())
    return _fernet


def encrypt_secret(plaintext: str) -> str:
    """加密明文 App Secret。返回 base64 密文字符串,前加 'fe:' 前缀便于识别。

    注意:已有前缀的字符串不会被二次加密。
    """
    if not plaintext:
        return ""
    if plaintext.startswith("fe:"):
        return plaintext  # 已加密,幂等
    f = _init_fernet()
    token = f.encrypt(plaintext.encode())
    return "fe:" + token.decode()


def decrypt_secret(ciphertext: str | None) -> str | None:
    """解密密文 App Secret。若非密文(不以 'fe:' 开头)则原样返回(向后兼容明文存储)。"""
    if not ciphertext:
        return ciphertext
    if not ciphertext.startswith("fe:"):
        # 明文存储的旧数据,直接返回
        return ciphertext
    f = _init_fernet()
    raw = ciphertext[3:]  # 去掉 'fe:' 前缀
    return f.decrypt(raw.encode()).decode()
