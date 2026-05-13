#!/usr/bin/env bash
# 合成最终演示视频 mp4。
#
# 步骤:
#   1. 每段 webm + wav → scene-XX.mp4 (视频/音频对齐, 静音补齐, libx264+aac)
#   2. concat 全部段 → kb-system-demo.mp4
#
# 前置:
#   - output/scene-XX-*.webm  (来自 record-demo.js)
#   - output/narration/scene-XX-*.wav  (来自 narration/tts.py)
#   - 系统装了 /opt/homebrew/opt/ffmpeg-full/bin/ffmpeg + /opt/homebrew/opt/ffmpeg-full/bin/ffprobe

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/output"
NAR="$OUT/narration"
SEG="$OUT/segments"
FINAL="$OUT/kb-system-demo.mp4"

mkdir -p "$SEG"

scenes=(
  "01-intro"
  "02-documents"
  "03-chunks"
  "04-qa"
  "05-insight"
  "06-challenge-loop"
  "07-survey"
  "08-outline-challenge"
  "09-outro"
)

# 每段视频开头要跳过的秒数 (React 加载白屏);  scene-01 setContent 黑底无白屏, scene-09 HTML 注入也无白屏
trim_start_for() {
  case "$1" in
    01-intro|09-outro) echo 0 ;;
    04-qa|06-challenge-loop|07-survey) echo 3.0 ;;
    *) echo 2.5 ;;
  esac
}

dur() {
  /opt/homebrew/opt/ffmpeg-full/bin/ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$1" 2>/dev/null || echo "0"
}

echo "=== 步骤 1: 合成各段 mp4 ==="
> "$SEG/concat.txt"

for s in "${scenes[@]}"; do
  webm="$OUT/scene-$s.webm"
  wav="$NAR/scene-$s.wav"
  out="$SEG/scene-$s.mp4"

  if [[ ! -f "$webm" ]]; then
    echo "  ⚠ 缺 $webm, 跳过"
    continue
  fi
  if [[ ! -f "$wav" ]]; then
    echo "  ⚠ 缺 $wav, 跳过"
    continue
  fi

  vd_raw=$(dur "$webm"); ad=$(dur "$wav")
  trim_start=$(trim_start_for "$s")
  vd=$(awk -v r="$vd_raw" -v t="$trim_start" 'BEGIN{print r - t}')
  echo "  scene $s: video=${vd}s (trim_start=${trim_start})  audio=${ad}s"

  # 以旁白时长 + 0.8s tail buffer 为目标 (避免旁白结束太突兀)
  target=$(awk -v a="$ad" 'BEGIN{print a + 0.8}')
  pad_v=$(awk -v t="$target" -v v="$vd" 'BEGIN{d=t-v; print (d>0)?d:0}')

  # 视频: 短了 tpad freeze 末尾, 长了 trim 到 target
  if awk -v p="$pad_v" 'BEGIN{exit !(p>0.05)}'; then
    vfilter="tpad=stop_mode=clone:stop_duration=$pad_v"
  else
    vfilter="trim=duration=$target,setpts=PTS-STARTPTS"
  fi

  # -ss 在 -i 前面: input-level seek, 跳过开头白屏更精确且快
  /opt/homebrew/opt/ffmpeg-full/bin/ffmpeg -y -loglevel error \
    -ss "$trim_start" -i "$webm" -i "$wav" \
    -filter_complex "[0:v]$vfilter,scale=1920:1080:flags=lanczos,format=yuv420p,fps=30[v]; \
                     [1:a]apad=pad_dur=0.8,atrim=duration=$target,asetpts=PTS-STARTPTS[a]" \
    -map "[v]" -map "[a]" \
    -c:v libx264 -preset medium -crf 22 \
    -c:a aac -b:a 192k -ar 44100 -ac 2 \
    -t "$target" \
    "$out"

  echo "file '$out'" >> "$SEG/concat.txt"
  echo "  ✓ $out ($(dur "$out")s)"
done

echo
echo "=== 步骤 2: 拼接所有段 → $FINAL ==="
/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg -y -loglevel error \
  -f concat -safe 0 -i "$SEG/concat.txt" \
  -c copy \
  "$FINAL"

echo
echo "=== 步骤 3: 生成 SRT 字幕 ==="
python3 "$DIR/narration/build-srt.py"
SRT="$OUT/subtitles.srt"

# 复制 srt 用同名陪伴 mp4, 播放器自动加载
cp "$SRT" "${FINAL%.mp4}.srt"
echo "  ✓ srt 同名陪伴: ${FINAL%.mp4}.srt"

echo
echo "=== ✓ 合成完成 ==="
echo "  视频: $FINAL  ($(dur "$FINAL")s, $(du -h "$FINAL" | awk '{print $1}'))"
echo "  字幕: ${FINAL%.mp4}.srt"
exit 0

# === 以下: 字幕烧录步骤 (默认不跑, 想要 burned-in 时手动启用) ===
echo "=== 步骤 4: 烧录字幕 (hardsub via ASS) → $FINAL ==="
# ASS 文件自带 style header, 不依赖 force_style 参数。绕开 /opt/homebrew/opt/ffmpeg-full/bin/ffmpeg subtitles filter 的 quote 地狱
TMP_DIR="/tmp/kb-demo-$$"
mkdir -p "$TMP_DIR"
cp "$TMP_NOSUB" "$TMP_DIR/in.mp4"

ASS_FILE="$TMP_DIR/subs.ass"
# 先把 SRT 转 ASS, 再把 ASS 的 default style 改成中文 + 大字号 + 半透明黑底
/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg -y -loglevel error -i "$SRT" "$ASS_FILE"

# 改 ASS [V4+ Styles] 的 Style: Default 行 — 用 PingFang SC, 26, 白字+半透明黑底
python3 - "$ASS_FILE" <<'PY'
import sys, re
p = sys.argv[1]
src = open(p, encoding='utf-8').read()
# ASS Style: Default 字段顺序 (V4+ 标准 23 个字段):
# Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour,
# Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle,
# Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
new_style = ("Style: Default,PingFang SC,20,"
             "&H00FFFFFF,&H000000FF,&H00000000,&H00000000,"     # 白字 / 副色 / 黑描边 / 透明背景
             "1,0,0,0,100,100,0,0,"                              # bold=1 加粗保可读性
             "1,2,1,2,30,30,25,1")                               # BorderStyle=1(outline) Outline=2 Shadow=1 Align=2 MV=25 (近底)
src = re.sub(r'^Style:\s*Default[^\n]*', new_style, src, count=1, flags=re.M)
# 关闭自动换行 (WrapStyle=2: 仅 \N 显式换行)
if 'WrapStyle' not in src:
    src = re.sub(r'(\[Script Info\][^\n]*\n)', r'\1WrapStyle: 2\n', src, count=1)
open(p, 'w', encoding='utf-8').write(src)
PY

cd "$TMP_DIR"
/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg -y -loglevel info \
  -i "in.mp4" \
  -vf "ass=subs.ass" \
  -c:v libx264 -preset medium -crf 22 \
  -c:a copy \
  "out.mp4" 2>&1 | tail -8
cd - >/dev/null

if [[ ! -f "$TMP_DIR/out.mp4" ]]; then
  echo "✗ 字幕烧录失败, 保留无字幕版"
  mv "$TMP_NOSUB" "$FINAL"
  rm -rf "$TMP_DIR"
  exit 1
fi

mv "$TMP_DIR/out.mp4" "$FINAL"
rm -rf "$TMP_DIR" "$TMP_NOSUB"

echo "✓ 合成完成: $FINAL"
echo "  时长: $(dur "$FINAL") 秒"
echo "  大小: $(du -h "$FINAL" | awk '{print $1}')"
