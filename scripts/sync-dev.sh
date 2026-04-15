#!/bin/bash
# =============================================================
# 开发实时同步脚本 - 将本地文件实时同步到 GCP 服务器
# 使用方式：bash scripts/sync-dev.sh
# 依赖：fswatch (brew install fswatch)
# =============================================================

set -e

# ===== 配置 =====
REMOTE_HOST="liu@34.45.112.217"
SSH_KEY="$HOME/.ssh/id_rsa_github_deploy"
REMOTE_PATH="/opt/kb-system"
LOCAL_PATH="$(cd "$(dirname "$0")/.." && pwd)"

# 排除不同步的文件
RSYNC_EXCLUDES=(
  "--exclude=.git"
  "--exclude=.env"
  "--exclude=__pycache__"
  "--exclude=*.pyc"
  "--exclude=*.egg-info"
  "--exclude=.pytest_cache"
  "--exclude=node_modules"
  "--exclude=dist"
  "--exclude=.DS_Store"
  "--exclude=backend/tests/fixtures/sample_docs"
)

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"

# ===== 函数 =====
sync_once() {
  rsync -avz --delete \
    "${RSYNC_EXCLUDES[@]}" \
    -e "ssh $SSH_OPTS" \
    "$LOCAL_PATH/" \
    "$REMOTE_HOST:$REMOTE_PATH/"
}

restart_services() {
  ssh $SSH_OPTS "$REMOTE_HOST" "
    cd $REMOTE_PATH
    sudo docker compose restart backend celery_worker 2>/dev/null || true
    echo '🔄 服务已重启'
  "
}

# ===== 检查依赖 =====
if ! command -v fswatch &>/dev/null; then
  echo "❌ 缺少 fswatch，请先安装：brew install fswatch"
  exit 1
fi

if ! command -v rsync &>/dev/null; then
  echo "❌ 缺少 rsync，请先安装：brew install rsync"
  exit 1
fi

# ===== 主逻辑 =====
echo "🚀 KB System 开发同步启动"
echo "   本地: $LOCAL_PATH"
echo "   远端: $REMOTE_HOST:$REMOTE_PATH"
echo ""

# 初始全量同步
echo "📦 初始同步..."
sync_once
echo "✅ 初始同步完成"
echo ""
echo "👀 监听文件变化（Ctrl+C 退出）..."

# 实时监听并同步
fswatch -0 \
  --exclude ".git" \
  --exclude "__pycache__" \
  --exclude "*.pyc" \
  --exclude ".env" \
  "$LOCAL_PATH" | while IFS= read -r -d '' event; do
    
  # 获取相对路径
  rel="${event#$LOCAL_PATH/}"
  echo "📝 变更: $rel"
  
  # 同步
  sync_once 2>/dev/null
  echo "  → 已同步"
  
  # 如果是 Python 文件变更，重启 backend
  if [[ "$rel" == backend/*.py ]] || [[ "$rel" == backend/**/*.py ]]; then
    echo "  🔄 Python 文件变更，重启服务..."
    restart_services
  fi
done
