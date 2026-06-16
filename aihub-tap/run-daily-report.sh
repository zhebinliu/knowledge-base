#!/usr/bin/env bash
# /opt/aihub-tap/run-daily-report.sh
# cron: 0 9 * * *  /opt/aihub-tap/run-daily-report.sh
#
# 每日 09:00 跑 analyze-rewrite.py,把报告写到 date-stamped 文件方便日对比。
# Level 0 dry-run 阶段使用,只统计不改请求。

set -euo pipefail

DIR=/opt/aihub-tap
LOGDIR=$DIR/logs
TODAY=$(date +%F)
OUT=$LOGDIR/rewrite-report-${TODAY}.txt

mkdir -p "$LOGDIR"
/usr/bin/python3 "$DIR/analyze-rewrite.py" > "$OUT" 2>&1
echo "[$(date -Iseconds)] daily report → $OUT" >> "$LOGDIR/rewrite-cron.log"

# 保留最近 14 天的 daily report,更早的清理(避免无限增长)
find "$LOGDIR" -maxdepth 1 -name 'rewrite-report-*.txt' -mtime +14 -delete 2>/dev/null || true
