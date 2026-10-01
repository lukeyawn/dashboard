#!/usr/bin/env bash
# The nightly backup (DESIGN §2): a snapshot and the JSON export, kept for 14
# nights on the VM and 30 in Google Drive. Run by backup.service as the dashboard user.
# Records how it went in $BACKUP_DIR/last-run.json, which the dashboard's
# status line reads (DESIGN §5.5).
set -euo pipefail
cd "$(dirname "$0")/.."

export BACKUP_DIR="${BACKUP_DIR:-/var/lib/dashboard/backups}"
export BACKUP_KEEP="${BACKUP_KEEP:-14}"
DRIVE_FOLDER="${DRIVE_FOLDER:-drive:dashboard-backups}"
STATUS="$BACKUP_DIR/last-run.json"

step=start
record() { # record OK STEP
    mkdir -p "$BACKUP_DIR"
    printf '{"at":"%s","ok":%s,"step":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" > "$STATUS.tmp"
    mv "$STATUS.tmp" "$STATUS"
}
trap 'record false "$step"' ERR

step=snapshot
node scripts/backup.js

# Only the dated nightly copies go to Drive; pre-deploy snapshots stay on the VM.
step=drive
rclone copy "$BACKUP_DIR" "$DRIVE_FOLDER" --include 'dashboard-[0-9]*'
rclone delete "$DRIVE_FOLDER" --min-age 30d
echo "Copied to $DRIVE_FOLDER"

record true complete
