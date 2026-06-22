"""会议音频 ASR 客户端 — xiaomi mimo-v2.5-asr 切片并发版(2026-05-12;2026-06-22 由 mimo-v2-omni 切专用 ASR 模型)。

设计同 meeting-ai 原项目:
1. 收完整音频(mp3/m4a/wav 等) → pydub/ffmpeg 转 16kHz 16bit mono PCM
2. 切 20 秒一片(640 000 字节/片)
3. 每片 PCM 封 WAV → base64 → 调 xiaomi `input_audio` chat.completions
4. asyncio.Semaphore 控制并发 8 路
5. 每片完成回调,把 (index, text) 写回 callback,调用方按 index 拼接
   并增量写 meeting.raw_transcript / done_chunks,前端轮询展示流式进度

代价比直传大(网络往返多 + 转 PCM),换来:
- 不再受 xiaomi 单次 inline 上限制约(20MB+ mp3 直传会 WriteTimeout)
- 流式输出:用户在前端能看到一段段出来
"""
from __future__ import annotations

import asyncio
import base64
import os
import structlog
from typing import Awaitable, Callable, Optional

import httpx

from config import settings
from services.meeting.audio_utils import convert_to_pcm, pcm_to_wav, REQUIRED_SAMPLE_RATE

logger = structlog.get_logger()


_XIAOMI_API_BASE = "https://token-plan-cn.xiaomimimo.com/v1"
# 2026-06-22:从通用全模态 mimo-v2-omni 切到专用 ASR 模型 mimo-v2.5-asr。
# 专用 ASR 又快又省(单片 ~9x 更少 token,不烧 reasoning token),转写质量等同。
# 它的请求格式跟 omni 不同(已实测):
#   1. input_audio.data 必须是 data URL(data:audio/wav;base64,...),裸 base64 报 400
#   2. content 里不能带 text 部分,提示词由网关侧注入,带了报
#      "ASR request must not include text parts"
_DEFAULT_MODEL = "mimo-v2.5-asr"

# 20 秒一片(meeting-ai 实测对 mimo-v2-omni 又快又稳的粒度)
CHUNK_SECONDS = 20
CHUNK_SIZE_BYTES = REQUIRED_SAMPLE_RATE * 2 * CHUNK_SECONDS  # = 640 000

# xiaomi 并发上限 8(每个 chunk 网络往返 + 模型推理 5-15s,8 路并发对 30 分钟会议
# 是 30/20=90 chunks → ceil(90/8)*10s ≈ 110s,可接受)
DEFAULT_CONCURRENCY = 8

# 单片 timeout 90s(xiaomi 单片正常 5-15s,留 6x 富余)
_PER_CHUNK_TIMEOUT = 90.0


def _format_from_filename(filename: str) -> str:
    """从文件名推断源音频格式,供 pydub.from_file 用。"""
    ext = os.path.splitext((filename or "").lower())[1].lstrip(".")
    # pydub 接受 mp3 / m4a / wav / ogg / webm / flac 等
    if ext in {"mp3", "m4a", "wav", "ogg", "webm", "flac", "aac"}:
        return "mp3" if ext == "aac" else ext  # aac 当 mp3 走 ffmpeg
    return "wav"  # 兜底


async def _transcribe_pcm_chunk(
    client: httpx.AsyncClient,
    api_key: str,
    pcm: bytes,
    idx: int,
    total: int,
) -> str:
    """单片 PCM → xiaomi 转写,返回文本。失败返回空字符串(不中断整体)。"""
    wav = pcm_to_wav(pcm)
    b64 = base64.b64encode(wav).decode("ascii")
    data_url = f"data:audio/wav;base64,{b64}"
    payload = {
        "model": _DEFAULT_MODEL,
        # mimo-v2.5-asr:content 仅放 input_audio(data URL),不带 text part(提示词由网关注入)
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "input_audio", "input_audio": {"data": data_url, "format": "wav"}},
                ],
            }
        ],
        "max_tokens": 2048,
        "temperature": 0.1,
    }
    try:
        resp = await client.post(
            f"{_XIAOMI_API_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=_PER_CHUNK_TIMEOUT,
        )
        if resp.status_code >= 400:
            logger.error("xiaomi_chunk_failed", idx=idx, total=total,
                         status=resp.status_code, body=resp.text[:200])
            return ""
        text = (resp.json().get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
        logger.info("xiaomi_chunk_done", idx=idx + 1, total=total, chars=len(text))
        return text
    except Exception as e:
        logger.exception("xiaomi_chunk_exception", idx=idx, total=total, error=str(e)[:200])
        return ""


# (index, text) 回调,供调用方按 index 写回进度
OnChunkResult = Callable[[int, str], Awaitable[None]]


async def transcribe_audio(
    audio_bytes: bytes,
    filename: str = "",
    on_chunk: Optional[OnChunkResult] = None,
    concurrency: int = DEFAULT_CONCURRENCY,
) -> str:
    """对整段音频做切片并发转写,边出边回调,返回拼接后的全文。

    - audio_bytes: 完整原始音频(mp3/m4a/wav 等)
    - filename: 用于推断格式(扩展名)
    - on_chunk: 每片完成时调用 `await on_chunk(index, text)`,调用方可借此
      增量更新 DB(`meeting.raw_transcript / done_chunks`,前端轮询展示进度)
    - 返回值:所有片段按顺序拼接的全文
    """
    if not audio_bytes:
        return ""

    api_key = settings.xiaomi_api_key
    if not api_key:
        raise RuntimeError("缺少 XIAOMI_API_KEY,无法走 mimo-v2-omni ASR")

    # 1. 转 PCM 16kHz/16bit/mono
    source_format = _format_from_filename(filename)
    pcm = convert_to_pcm(audio_bytes, source_format=source_format)

    # 2. 切片
    chunks = [pcm[i:i + CHUNK_SIZE_BYTES] for i in range(0, len(pcm), CHUNK_SIZE_BYTES)]
    total = len(chunks)
    logger.info("xiaomi_asr_start",
                bytes=len(audio_bytes),
                pcm_bytes=len(pcm),
                chunks=total,
                concurrency=concurrency)

    # 3. 并发转写,结果按 index 落位
    parts: list[str] = [""] * total
    sem = asyncio.Semaphore(concurrency)

    async with httpx.AsyncClient(timeout=httpx.Timeout(_PER_CHUNK_TIMEOUT)) as client:
        async def _run_chunk(i: int, c: bytes) -> None:
            async with sem:
                text = await _transcribe_pcm_chunk(client, api_key, c, i, total)
                parts[i] = text
                if on_chunk:
                    try:
                        await on_chunk(i, text)
                    except Exception:
                        logger.warning("on_chunk_callback_failed", idx=i)

        await asyncio.gather(*(_run_chunk(i, c) for i, c in enumerate(chunks)))

    # 拼接时加时间戳标记 [MM:SS],方便 LLM 提取时间区间
    timestamped: list[str] = []
    for i, p in enumerate(parts):
        if p:
            seconds = i * CHUNK_SECONDS
            mm, ss = divmod(seconds, 60)
            timestamped.append(f"[{mm:02d}:{ss:02d}] {p}")
    full_text = "\n".join(timestamped)
    logger.info("xiaomi_asr_done", total_chunks=total, full_chars=len(full_text))
    return full_text


async def transcribe_segment(audio_bytes: bytes, filename: str = "") -> str:
    """半实时「边录边传」:对单个录音分段(独立可解码 webm)转写,返回**纯文本**(无 [MM:SS] 前缀)。

    10s 段通常就 1 片;调用方(audio-chunk 端点)按 start_ms 自己拼会议级时间戳。
    复用 transcribe_audio 的切片并发,再剥掉它给每片加的段内相对时间戳。
    """
    import re as _re
    if not audio_bytes:
        return ""
    text = await transcribe_audio(audio_bytes, filename=filename, on_chunk=None)
    # transcribe_audio 给每片加了 [MM:SS](相对段内,半实时场景无意义)→ 剥掉只留文本
    return _re.sub(r"\[\d{2}:\d{2}\]\s*", "", text).strip()
