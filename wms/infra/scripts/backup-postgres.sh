#!/usr/bin/env sh
set -eu

# Русский комментарий: бэкап запускается на VPS из cron, секреты берутся из окружения compose.
BACKUP_DIR="${BACKUP_DIR:-/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/wms-postgres-$STAMP.sql.gz"
find "$BACKUP_DIR" -type f -name 'wms-postgres-*.sql.gz' -mtime +14 -delete
