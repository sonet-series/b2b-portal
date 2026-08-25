#!/bin/bash
# Nightly SQLite backup for the B2B portal.
#
# Uses `sqlite3 .backup`, NOT `cp`. Copying a live SQLite file can capture a
# torn write mid-transaction and produce a backup that restores to a corrupt
# database — and you would not find out until you needed it.
#
# Install:  crontab -e
#           15 2 * * * /opt/b2b-portal/deploy/backup.sh >> /var/log/b2b-backup.log 2>&1
set -euo pipefail

APP_DIR="/opt/b2b-portal"
DB="$APP_DIR/data/prod.db"
BACKUP_DIR="$APP_DIR/backups"
KEEP_DAYS=30
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/prod-$STAMP.db"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB" ]; then
  echo "[$(date -uIs)] ERROR: no database at $DB"
  exit 1
fi

# Run inside the container so the sqlite3 version matches the one that wrote
# the file, and so no host sqlite3 install is required.
docker exec b2b-portal-web sqlite3 /app/data/prod.db ".backup '/app/data/.backup-tmp.db'"
mv "$APP_DIR/data/.backup-tmp.db" "$OUT"

# Verify before trusting it. An unverified backup is a guess.
if ! sqlite3 "$OUT" "PRAGMA integrity_check;" 2>/dev/null | grep -q '^ok$'; then
  echo "[$(date -uIs)] ERROR: integrity check FAILED for $OUT"
  exit 1
fi

gzip -f "$OUT"
echo "[$(date -uIs)] ok: ${OUT}.gz ($(du -h "${OUT}.gz" | cut -f1))"

find "$BACKUP_DIR" -name 'prod-*.db.gz' -mtime "+$KEEP_DAYS" -delete
echo "[$(date -uIs)] pruned backups older than $KEEP_DAYS days"
