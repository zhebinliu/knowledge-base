"""音频格式工具:mp3/m4a/wav → 16kHz / 16-bit / mono PCM,以及 PCM → WAV 容器封装。

依赖:pydub(底层走 ffmpeg/libav 二进制,容器里 apt install ffmpeg)。

源自 meeting-ai 项目 services/asr/audio_utils.py(2026-05-12 合入 kb-system,
配合切片并发 ASR 实现长音频转写)。
"""
from __future__ import annotations

import io
import os
import subprocess
import tempfile
import wave
import structlog

logger = structlog.get_logger()

# xiaomi mimo-v2-omni 推荐输入:16 kHz / 16-bit / mono PCM(再封 WAV)
REQUIRED_SAMPLE_RATE: int = 16_000
REQUIRED_CHANNELS: int = 1
REQUIRED_SAMPLE_WIDTH: int = 2  # 16-bit = 2 bytes / sample


def convert_to_pcm(audio_data: bytes, source_format: str = "wav") -> bytes:
    """将任意音频格式转成 16kHz / 16-bit / mono raw PCM。

    走 ffmpeg 子进程**流式解码 + 边解码边降采样**,而非 pydub 全量载入:
    - 内存只留最终 16k/mono PCM。旧实现 `AudioSegment.from_file` 会先把整段解成
      原生采样率(48kHz 立体声)进内存 → 2.4h 录音 ~1.6GB 直接 OOM(worker SIGKILL)。
    - ffmpeg 自行**探测真实容器,不信 source_format/扩展名** —— soundcore 把
      Ogg/Opus 存成 `.m4a` 也能正确解码(旧实现按 .m4a 选 mp4 解码器 → "moov atom
      not found")。source_format 现仅用于 raw 直通与日志。

    Args:
        audio_data: 原始音频 bytes。
        source_format: 源格式提示;"raw" 直通返回(已是 PCM),其余一律交 ffmpeg 探测。

    Raises:
        RuntimeError: ffmpeg 未装 / 解码失败。
        ValueError: audio_data 为空。
    """
    if not audio_data:
        raise ValueError("audio_data 不能为空")

    # raw PCM 不转
    if source_format == "raw":
        return audio_data

    # 落临时文件让 ffmpeg 可 seek 探测容器(管道对部分格式探测不稳)
    with tempfile.NamedTemporaryFile(prefix="asr_in_", delete=False) as tf:
        tf.write(audio_data)
        tmp_in = tf.name
    try:
        proc = subprocess.run(
            [
                "ffmpeg", "-nostdin", "-v", "error",
                "-i", tmp_in,
                "-vn",  # 丢弃任何视频/封面流
                "-ac", str(REQUIRED_CHANNELS),
                "-ar", str(REQUIRED_SAMPLE_RATE),
                "-f", "s16le", "-acodec", "pcm_s16le", "pipe:1",
            ],
            capture_output=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg 未安装,无法转换音频。apt install ffmpeg。") from exc
    finally:
        try:
            os.unlink(tmp_in)
        except OSError:
            pass

    if proc.returncode != 0 or not proc.stdout:
        err = (proc.stderr or b"").decode("utf-8", "replace")[:400]
        raise RuntimeError(
            f"ffmpeg 解码失败(rc={proc.returncode}, source_hint={source_format}): {err}"
        )

    pcm: bytes = proc.stdout
    logger.info(
        "audio_converted_to_pcm",
        source_format=source_format,
        input_bytes=len(audio_data),
        pcm_bytes=len(pcm),
        sample_rate=REQUIRED_SAMPLE_RATE,
    )
    return pcm


def pcm_to_wav(pcm_data: bytes, sample_rate: int = REQUIRED_SAMPLE_RATE) -> bytes:
    """把 raw PCM 封到 WAV 容器(多模态模型一般需要标准音频容器)。"""
    with io.BytesIO() as wav_io:
        with wave.open(wav_io, "wb") as wav_file:
            wav_file.setnchannels(REQUIRED_CHANNELS)
            wav_file.setsampwidth(REQUIRED_SAMPLE_WIDTH)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm_data)
        return wav_io.getvalue()
