#!/bin/bash
# Restores a backup over the live database.
#
# DESTRUCTIVE. Stops the container, keeps the current database as .pre-restore,
# and puts the chosen backup in its place.
#
# Usage: deploy/restore.sh /opt/b2b-portal/backups/prod-20260901T021500Z.db.gz
set -euo pipefail

APP_DIR="/opt/b2b-portal"
BACKUP="${1:?usage: restore.sh <backup.db.gz>}"
[ -f "$BACKUP" ] || { echo "No such backup: $BACKUP"; exit 1; }

read -rp "Restore $BACKUP over the live database? [y/N] " reply
[ "$reply" = "y" ] || { echo "Aborted."; exit 1; }

cd "$APP_DIR"
TMP="$(mktemp -d)"
gunzip -c "$BACKUP" > "$TMP/restore.db"

sqlite3 "$TMP/restore.db" "PRAGMA integrity_check;" | grep -q '^ok$' \
  || { echo "Backup failed integrity check — refusing to restore."; exit 1; }

docker compose down
mv "$APP_DIR/data/prod.db" "$APP_DIR/data/prod.db.pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
mv "$TMP/restore.db" "$APP_DIR/data/prod.db"
chown 1001:1001 "$APP_DIR/data/prod.db"
docker compose up -d

echo "Restored. The previous database is kept alongside as .pre-restore-*"
