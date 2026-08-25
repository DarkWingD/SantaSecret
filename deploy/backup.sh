#!/usr/bin/env bash
# Consistent SQLite backup, gzipped, rotated, with optional offsite copy.
# Optional offsite: create /opt/secretsanta/backup.env with:  RCLONE_REMOTE=myremote:ss-backups
set -euo pipefail
APP_DIR="/opt/secretsanta/app"
BACKUP_DIR="/opt/secretsanta/backups"
KEEP=14
mkdir -p "${BACKUP_DIR}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${BACKUP_DIR}/ss-${STAMP}.db"
sqlite3 "${APP_DIR}/data.db" ".backup '${DEST}'"
gzip -f "${DEST}"
ls -1t "${BACKUP_DIR}"/ss-*.db.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
if [[ -f /opt/secretsanta/backup.env ]]; then
  # shellcheck disable=SC1091
  source /opt/secretsanta/backup.env
  if [[ -n "${RCLONE_REMOTE:-}" ]]; then rclone copy "${DEST}.gz" "${RCLONE_REMOTE}" || echo "backup: rclone failed" >&2; fi
fi
echo "backup: wrote ${DEST}.gz"
