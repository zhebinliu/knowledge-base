#!/usr/bin/env python3
"""把 narration/script.md + 每段 wav 时长 → 生成 SRT 字幕。

字幕按句号/问号/感叹号/逗号拆句, 每句最长 30 字, 按字符数加权分配段内时长。
段在视频中的起点用 segments/scene-XX.mp4 的累计时长。

用法:
  python3 scripts/demo-video/narration/build-srt.py
  → 输出 scripts/demo-video/output/subtitles.srt
"""
from __future__ import annotations
import json
import re
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SCRIPT_MD = BASE / "narration" / "script.md"
SEGMENTS = BASE / "output" / "segments"
NAR_DIR = BASE / "output" / "narration"
SRT_OUT = BASE / "output" / "subtitles.srt"

SCENE_ORDER = [
    "scene-01-intro",
    "scene-02-documents",
    "scene-03-chunks",
    "scene-04-qa",
    "scene-05-insight",
    "scene-06-challenge-loop",
    "scene-07-survey",
    "scene-08-outline-challenge",
    "scene-09-outro",
]


def parse_script(md_path: Path) -> dict[str, str]:
    out: dict[str, list[str]] = {}
    cur: str | None = None
    for line in md_path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^##\s+(scene-\S+)\s*$", line)
        if m:
            cur = m.group(1)
            out[cur] = []
        elif cur:
            if line.startswith("#"):
                continue
            out[cur].append(line)
    return {k: re.sub(r"\n{2,}", "\n", "\n".join(v)).strip() for k, v in out.items()}


def split_to_subtitles(text: str, max_chars: int = 30) -> list[str]:
    """按标点拆句, 过长再二次拆。"""
    # 先按强标点拆
    parts = re.split(r"(?<=[。？！])\s*", text)
    parts = [p.strip() for p in parts if p.strip()]
    # 二次拆: 过长的按逗号/顿号继续拆
    refined: list[str] = []
    for p in parts:
        if len(p) <= max_chars:
            refined.append(p)
            continue
        sub = re.split(r"(?<=[,，、；])\s*", p)
        buf = ""
        for s in sub:
            s = s.strip()
            if not s:
                continue
            if buf and len(buf) + len(s) > max_chars:
                refined.append(buf)
                buf = s
            else:
                buf = buf + s if buf else s
        if buf:
            refined.append(buf)
    return refined


FFPROBE = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe"


def ffprobe_dur(path: Path) -> float:
    r = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return float(r.stdout.strip().splitlines()[0])
    except Exception:
        return 0.0


def fmt(seconds: float) -> str:
    if seconds < 0:
        seconds = 0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds - h * 3600 - m * 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")


def main() -> int:
    scripts = parse_script(SCRIPT_MD)
    if not SEGMENTS.exists():
        sys.stderr.write(f"找不到 {SEGMENTS}, 先跑 build.sh 第 1 步\n")
        return 1

    srt_lines: list[str] = []
    idx = 1
    offset = 0.0

    for scene_id in SCENE_ORDER:
        seg_path = SEGMENTS / f"{scene_id}.mp4"
        wav_path = NAR_DIR / f"{scene_id}.wav"
        if not seg_path.exists():
            print(f"⚠ 缺 {seg_path}, 跳过该 scene 字幕")
            continue
        seg_dur = ffprobe_dur(seg_path)
        audio_dur = ffprobe_dur(wav_path) if wav_path.exists() else seg_dur

        text = scripts.get(scene_id, "")
        if not text:
            offset += seg_dur
            continue

        sentences = split_to_subtitles(text)
        if not sentences:
            offset += seg_dur
            continue

        total_chars = sum(len(s) for s in sentences)
        # 字幕仅在旁白播放期间显示, 不延伸到 freeze 帧
        cumulative = 0.0
        for s in sentences:
            share = len(s) / total_chars
            dur = audio_dur * share
            start = offset + cumulative
            end = offset + cumulative + dur
            srt_lines.append(f"{idx}")
            srt_lines.append(f"{fmt(start)} --> {fmt(end)}")
            srt_lines.append(s)
            srt_lines.append("")
            idx += 1
            cumulative += dur

        offset += seg_dur

    SRT_OUT.write_text("\n".join(srt_lines), encoding="utf-8")
    print(f"✓ {idx - 1} 条字幕 → {SRT_OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
