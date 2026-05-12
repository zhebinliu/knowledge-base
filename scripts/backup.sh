#!/usr/bin/env bash
# 每日全量备份:Postgres + MinIO + Qdrant → GCS bucket
#
# 使用前置:
#   1. 在 GCP 控制台建 bucket(如 gs://kb-system-backup)
#   2. 给 GCE VM 服务账号加 Storage Object Admin 权限
#   3. 在 bucket 配 Lifecycle Rule:7 天后自动删除(免得脚本自己 prune)
#   4. 把 BACKUP_GCS_BUCKET 写进 /opt/kb-system/.env 或 crontab 环境
#
# 配 crontab(示例,凌晨 4 点跑):
#   0 4 * * * /opt/kb-system/scripts/backup.sh >> /var/log/kb-backup.log 2>&1
#
# 还原见 ./restore.sh

set -euo pipefail

BUCKET="${BACKUP_GCS_BUCKET:-gs://kb-system-backup}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-kb-system}"
TS=$(date -u +%Y%m%d_%H%M%S)
TMP=$(mktemp -d)
trap "rm -rf '$TMP'" EXIT

log() { echo "[backup $(date -u +%H:%M:%S)] $*"; }

# 1) Postgres ─────────────────────────────────────────────────────────────────
log "pg_dump..."
docker exec "${COMPOSE_PROJECT}-postgres-1" \
  pg_dump -U kb_admin -F c -Z 9 kb_system > "$TMP/postgres_${TS}.dump"
log "postgres dump $(du -h "$TMP/postgres_${TS}.dump" | cut -f1)"

# 2) MinIO ────────────────────────────────────────────────────────────────────
log "minio tar..."
docker exec "${COMPOSE_PROJECT}-minio-1" \
  tar czf - -C /data . > "$TMP/minio_${TS}.tgz"
log "minio tar $(du -h "$TMP/minio_${TS}.tgz" | cut -f1)"

# 3) Qdrant ───────────────────────────────────────────────────────────────────
log "qdrant snapshot..."
SNAP_JSON=$(curl -fSs -X POST "http://127.0.0.1:6333/collections/kb_chunks/snapshots")
SNAP_NAME=$(echo "$SNAP_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin)['result']['name'])")
docker cp "${COMPOSE_PROJECT}-qdrant-1:/qdrant/snapshots/kb_chunks/$SNAP_NAME" "$TMP/qdrant_${TS}.snapshot"
# 清理 server 上的旧 snapshot(避免累积撑爆磁盘)
docker exec "${COMPOSE_PROJECT}-qdrant-1" \
  sh -c "find /qdrant/snapshots -type f -mtime +1 -delete" || true
log "qdrant snapshot $(du -h "$TMP/qdrant_${TS}.snapshot" | cut -f1)"

# 4) 上传到 GCS ───────────────────────────────────────────────────────────────
log "uploading to $BUCKET ..."
gsutil -q cp "$TMP/postgres_${TS}.dump"   "$BUCKET/postgres/"
gsutil -q cp "$TMP/minio_${TS}.tgz"       "$BUCKET/minio/"
gsutil -q cp "$TMP/qdrant_${TS}.snapshot" "$BUCKET/qdrant/"

log "done at $TS"

# 5) (可选) 失败通知 ─────────────────────────────────────────────────────────
# 如果 trap 兜底要发通知,改写为:
#   trap 'rc=$?; rm -rf "$TMP"; [ $rc -ne 0 ] && curl -X POST "$WEBHOOK" -d "backup failed @${TS}"' EXIT
