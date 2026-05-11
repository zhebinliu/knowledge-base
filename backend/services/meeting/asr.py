"""会议音频 ASR 客户端 — 仅 xiaomi mimo-v2-omni(2026-05-11)。

走 OpenAI 兼容多模态接口,无本地依赖。复用 kb-system 的 xiaomi api 凭证
(`config.settings.xiaomi_api_key`),不再单独配置。

Block C MVP:整段上传 → 整段转写。30 分钟以内的会议直接走;更长的录音
后续在 Block D 走 WebSocket 流式 + chunk 拼接。
"""
from __future__ import annotations

import base64
import structlog
import httpx

from config import settings

logger = structlog.get_logger()


# 复用 kb-system model_router 里的 mimo-v2-omni 配置
_XIAOMI_API_BASE = "https://token-plan-cn.xiaomimimo.com/v1"  # 与 model_router._XIAOMI 一致
_DEFAULT_MODEL = "mimo-v2-omni"
_DEFAULT_PROMPT = (
    "你是一个会议记录员。请精确地将这段会议语音转写为文本,保持原始口吻。"
    "只输出转写后的文本内容,不要有任何开场白或解释。"
)


def _audio_format_from_filename(filename: str) -> str:
    """从文件名推断音频格式(供 input_audio.format 字段)。"""
    name = (filename or "").lower()
    if name.endswith(".wav"):
        return "wav"
    if name.endswith(".mp3"):
        return "mp3"
    if name.endswith(".m4a") or name.endswith(".aac"):
        return "m4a"
    if name.endswith(".webm"):
        return "webm"
    if name.endswith(".ogg"):
        return "ogg"
    # 默认按 wav 尝试
    return "wav"


async def transcribe_audio(audio_bytes: bytes, filename: str = "") -> str:
    """对整段音频做转写,返回纯文本。失败抛 RuntimeError。"""
    if not audio_bytes:
        return ""

    api_key = settings.xiaomi_api_key
    if not api_key:
        raise RuntimeError("缺少 XIAOMI_API_KEY,无法走 mimo-v2-omni ASR")

    audio_format = _audio_format_from_filename(filename)
    b64 = base64.b64encode(audio_bytes).decode("ascii")
    payload = {
        "model": _DEFAULT_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _DEFAULT_PROMPT},
                    {"type": "input_audio", "input_audio": {"data": b64, "format": audio_format}},
                ],
            }
        ],
        "max_tokens": 4096,
        "temperature": 0.1,
    }

    logger.info("xiaomi_asr_request", bytes=len(audio_bytes), format=audio_format)
    async with httpx.AsyncClient(timeout=600.0) as client:
        resp = await client.post(
            f"{_XIAOMI_API_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if resp.status_code >= 400:
            logger.error("xiaomi_asr_failed", status=resp.status_code, body=resp.text[:300])
            raise RuntimeError(f"Xiaomi ASR 失败 status={resp.status_code}")
        data = resp.json()

    text = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
    logger.info("xiaomi_asr_done", out_chars=len(text))
    return text
