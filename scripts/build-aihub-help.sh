#!/usr/bin/env bash
# 渲染 new-api/AIHUB_使用手册.md → HTML → 同步到服务器 /opt/aihub-docs/index.html
#
# 用法:
#   ./scripts/build-aihub-help.sh          # 渲染 + 上传
#   ./scripts/build-aihub-help.sh --local  # 只渲染本地预览,不传服务器
#
# 改完文档,跑这一行就生效(不用 rebuild 镜像、不用重启容器),浏览器刷一下就行。
# 站点 nginx 给 /help/ 加了 5min Cache-Control,必要时 cmd+shift+R 强刷。

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MD="$REPO_ROOT/new-api/AIHUB_使用手册.md"
TPL="$REPO_ROOT/new-api/help-template.html"
OUT_DIR="${TMPDIR:-/tmp}/aihub-docs-build"
OUT="$OUT_DIR/index.html"

REMOTE_USER=liu
REMOTE_HOST=34.42.241.99
REMOTE_PATH=/opt/aihub-docs/index.html
SSH_KEY="$HOME/.ssh/id_rsa_github_deploy"

# --- 前置检查 ---
command -v pandoc >/dev/null || { echo "✘ 缺 pandoc: brew install pandoc"; exit 1; }
command -v python3 >/dev/null || { echo "✘ 缺 python3"; exit 1; }
[ -f "$MD" ] || { echo "✘ 找不到 markdown 源文件: $MD"; exit 1; }
[ -f "$TPL" ] || { echo "✘ 找不到模板: $TPL"; exit 1; }

mkdir -p "$OUT_DIR"

# --- 渲染 ---
echo "▶ 渲染 markdown → HTML(pandoc)"
pandoc "$MD" --syntax-highlighting=none -t html5 -o "$OUT_DIR/content.html"

echo "▶ 套模板"
python3 - <<PY
tpl  = open("$TPL", encoding="utf-8").read()
body = open("$OUT_DIR/content.html", encoding="utf-8").read()
open("$OUT", "w", encoding="utf-8").write(tpl.replace("{{CONTENT}}", body))
import os; print(f"  → {os.path.getsize('$OUT')} bytes")
PY

# --- 模式分支 ---
if [ "${1:-}" = "--local" ]; then
    echo "✓ 本地渲染完成: file://$OUT"
    [ "$(uname)" = "Darwin" ] && open "$OUT"
    exit 0
fi

# --- 上传 ---
echo "▶ scp → $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"
scp -i "$SSH_KEY" -q "$OUT" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"

# --- 校验 ---
echo "▶ 远端校验"
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "ls -la $REMOTE_PATH"
HTTP_CODE=$(curl -sS -o /dev/null -w '%{http_code}' "https://aihub.tokenwave.cloud/help/?$(date +%s)")
SIZE=$(curl -sS "https://aihub.tokenwave.cloud/help/?$(date +%s)" | wc -c | tr -d ' ')
echo "  HTTPS /help/ → HTTP $HTTP_CODE,size=$SIZE bytes"

echo "✓ 完成 → https://aihub.tokenwave.cloud/help"
