#!/usr/bin/env bash
# 从 GCS 备份还原 Postgres + MinIO + Qdrant
#
# 使用:
#   ./restore.sh 20260512_040001         # 还原指定时间戳
#   ./restore.sh latest                  # 自动取最新一份
#
# 警告:**会清空当前 Postgres + Qdrant collection + MinIO bucket**,
#       生产环境跑前请二次确认。

set -euo pipefail

BUCKET="${BACKUP_GCS_BUCKET:-gs://kb-system-backup}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-kb-system}"
TS="${1:-}"

if [ -z "$TS" ]; then
  echo "用法: $0 <时间戳 或 latest>"
  echo "示例: $0 20260512_040001"
  exit 1
fi

if [ "$TS" = "latest" ]; then
  TS=$(gsutil ls "$BUCKET/postgres/" | sort | tail -1 | sed -E 's|.*postgres_([0-9_]+)\.dump|\1|')
  echo "[restore] 自动选择最新备份: $TS"
fi

TMP=$(mktemp -d)
trap "rm -rf '$TMP'" EXIT

log() { echo "[restore $(date -u +%H:%M:%S)] $*"; }

# 二次确认
read -p "⚠️  这会清空当前 Postgres / Qdrant / MinIO 然后用 $TS 备份还原。输 YES 继续: " confirm
if [ "$confirm" != "YES" ]; then
  echo "已取消"
  exit 1
fi

# 下载 ─────────────────────────────────────────────────────────────────────
log "downloading from $BUCKET ..."
gsutil -q cp "$BUCKET/postgres/postgres_${TS}.dump"   "$TMP/"
gsutil -q cp "$BUCKET/minio/minio_${TS}.tgz"          "$TMP/"
gsutil -q cp "$BUCKET/qdrant/qdrant_${TS}.snapshot"   "$TMP/"

# Postgres ────────────────────────────────────────────────────────────────
log "restoring postgres..."
docker exec "${COMPOSE_PROJECT}-postgres-1" psql -U kb_admin -d postgres \
  -c "DROP DATABASE IF EXISTS kb_system WITH (FORCE);"
docker exec "${COMPOSE_PROJECT}-postgres-1" psql -U kb_admin -d postgres \
  -c "CREATE DATABASE kb_system;"
docker exec -i "${COMPOSE_PROJECT}-postgres-1" \
  pg_restore -U kb_admin -d kb_system --no-owner --no-acl < "$TMP/postgres_${TS}.dump"

# MinIO ───────────────────────────────────────────────────────────────────
log "restoring minio..."
docker exec "${COMPOSE_PROJECT}-minio-1" sh -c "rm -rf /data/* /data/.*minio.sys* 2>/dev/null || true"
docker cp "$TMP/minio_${TS}.tgz" "${COMPOSE_PROJECT}-minio-1:/tmp/minio_restore.tgz"
docker exec "${COMPOSE_PROJECT}-minio-1" sh -c "tar xzf /tmp/minio_restore.tgz -C /data && rm /tmp/minio_restore.tgz"

# Qdrant ──────────────────────────────────────────────────────────────────
log "restoring qdrant collection kb_chunks..."
docker cp "$TMP/qdrant_${TS}.snapshot" "${COMPOSE_PROJECT}-qdrant-1:/qdrant/snapshots/kb_chunks/_restore.snapshot"
curl -fSs -X PUT "http://127.0.0.1:6333/collections/kb_chunks/snapshots/recover" \
  -H "Content-Type: application/json" \
  -d '{"location": "file:///qdrant/snapshots/kb_chunks/_restore.snapshot"}'

# 重启 backend / celery ── 让代码端拿到新数据
log "restarting backend + celery_worker..."
docker compose -p "$COMPOSE_PROJECT" restart backend celery_worker

log "done. 验证:"
log "  docker exec ${COMPOSE_PROJECT}-postgres-1 psql -U kb_admin -d kb_system -c 'SELECT count(*) FROM documents;'"
log "  curl http://127.0.0.1:6333/collections/kb_chunks"
