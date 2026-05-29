#!/usr/bin/env bash
# 磁盘卫生 — 防止 docker build cache / 废弃镜像层撑爆 /opt/data
#
# 背景(2026-05-29):/opt/data(docker data-root,20G)被 13G build cache + 废弃
# 镜像层堆满 → postgres checkpoint 写不下 PANIC → 全站 500。真实业务数据只有 ~1.5G,
# 撑爆的全是可回收的镜像层。根因是「在服务器上反复 docker compose build」累积。
#
# 本脚本两种模式:
#   无参数        : 只检查用量,超阈值告警;超紧急阈值时自动 prune(自愈)
#   --prune       : 强制跑 docker builder prune + image prune(每周定期清)
#
# cron 建议:
#   0 */6 * * 0-6 /opt/kb-system/scripts/disk-hygiene.sh        >> /var/log/kb-disk.log 2>&1   # 每 6h 巡检
#   0 4   * * 0   /opt/kb-system/scripts/disk-hygiene.sh --prune >> /var/log/kb-disk.log 2>&1   # 每周日 4am 清
#
# 安全:builder prune / image prune 只清「未被任何在跑容器引用」的层,
#       绝不动 named volume(postgres_data / minio_data / qdrant_data / upload_data)。
set -uo pipefail

MOUNT="/opt/data"           # docker data-root 所在盘
WARN_PCT=85                 # 超此值告警
CRIT_PCT=90                 # 超此值无视周期立刻自愈 prune
LOG_TAG="kb-disk"

# 可选飞书 webhook 告警(.env 里的 DEPLOY_WEBHOOK_URL,cron 不自动 source 故手动读)
if [ -f /opt/kb-system/.env ]; then
    # 只取这一个 key,避免把整个 .env 注入 shell
    WEBHOOK_URL="$(grep -E '^DEPLOY_WEBHOOK_URL=' /opt/kb-system/.env | cut -d= -f2- | tr -d '"'"'"'')"
fi
WEBHOOK_URL="${WEBHOOK_URL:-}"

ts() { date -Iseconds; }

alert() {
    # $1 = 文本。同时写 log + syslog(google-cloud-ops-agent 会摄取)+ 可选 webhook
    local msg="$1"
    echo "$(ts) ALERT: ${msg}"
    command -v logger >/dev/null 2>&1 && logger -t "$LOG_TAG" "$msg"
    if [ -n "$WEBHOOK_URL" ]; then
        curl -fsS -m 10 -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"⚠️ ${msg}\"}}" >/dev/null 2>&1 || true
    fi
}

usage_pct() {
    # 返回 $MOUNT 的已用百分比(纯数字)
    df --output=pcent "$MOUNT" 2>/dev/null | tail -1 | tr -dc '0-9'
}

do_prune() {
    echo "$(ts) prune start — before:"
    df -h "$MOUNT" | tail -1
    # build cache:所有未引用层
    sudo docker builder prune -af 2>&1 | tail -2
    # 废弃镜像:无 tag 且无容器引用(-a 会清掉所有没有在跑容器用的镜像;
    # CI 部署是 docker pull 指定 sha tag,在跑的镜像有容器引用,不会被误删)
    sudo docker image prune -af 2>&1 | tail -2 || true
    echo "$(ts) prune done — after:"
    df -h "$MOUNT" | tail -1
}

MODE="${1:-check}"
PCT="$(usage_pct)"
[ -z "$PCT" ] && { echo "$(ts) 无法读取 ${MOUNT} 用量,跳过"; exit 0; }

echo "$(ts) ${MOUNT} 用量 ${PCT}% (warn=${WARN_PCT} crit=${CRIT_PCT} mode=${MODE})"

if [ "$MODE" = "--prune" ]; then
    do_prune
    NEW_PCT="$(usage_pct)"
    echo "$(ts) 周期清理完成:${PCT}% → ${NEW_PCT}%"
    exit 0
fi

# 巡检模式
if [ "$PCT" -ge "$CRIT_PCT" ]; then
    alert "KB 磁盘 ${MOUNT} 已用 ${PCT}%(≥${CRIT_PCT}% 危险),自动清理 build cache 中…"
    do_prune
    NEW_PCT="$(usage_pct)"
    if [ "$NEW_PCT" -ge "$CRIT_PCT" ]; then
        alert "KB 磁盘自愈后仍 ${NEW_PCT}%,可回收空间不足,需人工扩容(GCP 把 sda 扩到 50G)"
    else
        echo "$(ts) 自愈完成:${PCT}% → ${NEW_PCT}%"
    fi
elif [ "$PCT" -ge "$WARN_PCT" ]; then
    alert "KB 磁盘 ${MOUNT} 已用 ${PCT}%(≥${WARN_PCT}% 预警),将在每周日自动清理;若持续增长请考虑扩容"
fi
