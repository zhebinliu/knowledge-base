#!/usr/bin/env python3
"""
合成课程页 TTS 音频。

用法:
    python3 synthesize_pages.py <pages.json 路径> <输出目录>

输入 pages.json 形如:
{
  "voice": "白桦", "model": "mimo-v2.5-tts", "prompt": "...",
  "pages": [ {"id": "01-opening", "script": "..."}, ... ]
}

输出: <输出目录>/<id>.wav (例如 01-opening.wav)
环境变量 XIAOMI_API_KEY (从 /opt/kb-system/.env 读)
"""
import sys
import os
import json
import base64
import time
import pathlib
import requests

API_BASE = "https://token-plan-cn.xiaomimimo.com/v1"
ENV_PATH = "/opt/kb-system/.env"


def load_api_key():
    key = os.environ.get("XIAOMI_API_KEY")
    if key:
        return key
    if not os.path.exists(ENV_PATH):
        sys.exit(f"未找到 {ENV_PATH},也无 XIAOMI_API_KEY 环境变量")
    with open(ENV_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("XIAOMI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("XIAOMI_API_KEY 未在 .env 中找到")


def synthesize_one(api_key, model, voice, prompt, script_text, fmt="mp3", retries=3):
    url = f"{API_BASE}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": script_text},
        ],
        "audio": {"format": fmt, "voice": voice},
    }
    last_err = None
    for attempt in range(retries):
        try:
            resp = requests.post(url, headers=headers, json=body, timeout=120)
            if resp.status_code != 200:
                last_err = f"HTTP {resp.status_code} {resp.text[:300]}"
                if resp.status_code >= 500:
                    time.sleep(2 ** attempt)
                    continue
                raise RuntimeError(last_err)
            data = resp.json()
            audio_b64 = data["choices"][0]["message"]["audio"]["data"]
            return base64.b64decode(audio_b64)
        except (requests.RequestException, KeyError) as e:
            last_err = str(e)
            time.sleep(2 ** attempt)
    raise RuntimeError(f"重试 {retries} 次失败: {last_err}")


def main():
    if len(sys.argv) < 3:
        sys.exit("用法: synthesize_pages.py <pages.json> <输出目录>")
    pages_path = sys.argv[1]
    out_dir = pathlib.Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    with open(pages_path, encoding="utf-8") as f:
        data = json.load(f)

    api_key = load_api_key()
    model = data.get("model", "mimo-v2.5-tts")
    voice = data.get("voice", "白桦")
    prompt = data.get("prompt", "专业、温和、清晰、像企业培训讲师的男声。")
    fmt = data.get("format", "mp3")

    pages = data["pages"]
    total = len(pages)
    print(f"准备合成 {total} 页, voice={voice} model={model} format={fmt}")

    for i, page in enumerate(pages, 1):
        pid = page["id"]
        script = page["script"]
        out = out_dir / f"{pid}.{fmt}"
        if out.exists() and out.stat().st_size > 1000:
            print(f"[{i}/{total}] {pid} 已存在 ({out.stat().st_size} bytes) — 跳过")
            continue
        print(f"[{i}/{total}] {pid} 合成中 ({len(script)} 字)... ", end="", flush=True)
        t0 = time.time()
        try:
            audio = synthesize_one(api_key, model, voice, prompt, script, fmt=fmt)
            with open(out, "wb") as f:
                f.write(audio)
            print(f"OK {len(audio)//1024} KB / {time.time()-t0:.1f}s")
        except Exception as e:
            print(f"FAIL: {e}")
            sys.exit(1)

    print(f"\n全部完成。输出在 {out_dir}/")


if __name__ == "__main__":
    main()
