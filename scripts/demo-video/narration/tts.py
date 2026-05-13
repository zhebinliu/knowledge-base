#!/usr/bin/env python3
"""把 narration/script.md 切成 9 段 → 调小米 mimo TTS → 每段一个 wav。

用法:
  pip install requests
  MIMO_API_KEY=<key> python3 scripts/demo-video/narration/tts.py
  # 默认 key 写死在脚本里 (内部演示用), 想覆盖才需要 env

  python3 scripts/demo-video/narration/tts.py --scene scene-01-intro  # 只跑一段
  python3 scripts/demo-video/narration/tts.py --force                 # 强制重跑 (默认跳过已存在)

输出:
  scripts/demo-video/output/narration/scene-XX-XXXX.wav  (跟 scene id 同名)
"""
from __future__ import annotations
import argparse
import base64
import json
import os
import re
import sys
from pathlib import Path

import requests

API_URL = "https://token-plan-cn.xiaomimimo.com/v1/chat/completions"
API_KEY = os.environ.get("MIMO_API_KEY",
                        "tp-c65fjrcg8an6pf8o2t5sdkoflcue46czlx0kvl9ayujdj825")
MODEL = "mimo-v2.5-tts"
VOICE = "白桦"
STYLE = "专业播音员风格, 中文清晰, 中速, 平静自信, 段落之间适度停顿。"

NARRATION_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = NARRATION_DIR.parent / "output" / "narration"


def parse_script(md_path: Path) -> list[tuple[str, str]]:
    """从 script.md 抽出 (scene_id, text) 列表"""
    out: list[tuple[str, str]] = []
    cur_id: str | None = None
    cur_buf: list[str] = []

    def flush():
        if cur_id and cur_buf:
            text = "\n".join(cur_buf).strip()
            # 去掉空行多余
            text = re.sub(r"\n{2,}", "\n", text)
            out.append((cur_id, text))

    for line in md_path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^##\s+(scene-\S+)\s*$", line)
        if m:
            flush()
            cur_id = m.group(1)
            cur_buf = []
        elif cur_id:
            if line.startswith("#"):
                continue
            cur_buf.append(line)
    flush()
    return out


def synth_one(scene_id: str, text: str, out_path: Path, force: bool = False) -> None:
    if out_path.exists() and not force:
        print(f"  ✓ {scene_id} 已存在, 跳过 ({out_path.stat().st_size // 1024} KB)")
        return
    print(f"  → {scene_id} 合成中 ({len(text)} 字)...", flush=True)
    r = requests.post(
        API_URL,
        headers={"api-key": API_KEY, "Content-Type": "application/json"},
        json={
            "model": MODEL,
            "messages": [
                {"role": "user", "content": STYLE},
                {"role": "assistant", "content": text},
            ],
            "audio": {"format": "wav", "voice": VOICE},
        },
        timeout=180,
    )
    if r.status_code != 200:
        raise RuntimeError(f"{scene_id} TTS 失败 {r.status_code}: {r.text[:200]}")
    data = r.json()
    audio_b64 = data["choices"][0]["message"]["audio"]["data"]
    wav = base64.b64decode(audio_b64)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(wav)
    print(f"  ✓ {scene_id} → {out_path.name} ({len(wav) // 1024} KB)")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--scene", help="只合成指定 scene")
    p.add_argument("--force", action="store_true", help="强制重跑")
    args = p.parse_args()

    script = NARRATION_DIR / "script.md"
    if not script.exists():
        sys.stderr.write(f"找不到 {script}\n")
        return 1

    segs = parse_script(script)
    print(f"共 {len(segs)} 段旁白")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for sid, text in segs:
        if args.scene and sid != args.scene:
            continue
        out = OUTPUT_DIR / f"{sid}.wav"
        try:
            synth_one(sid, text, out, force=args.force)
        except Exception as e:
            print(f"  ✗ {sid}: {e}", file=sys.stderr)

    print(f"\n输出目录: {OUTPUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
