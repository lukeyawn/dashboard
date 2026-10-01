#!/usr/bin/env bash
# The nightly backup (DESIGN §2): a snapshot and the JSON export, kept for 14
# nights on the VM and 30 in Google Drive. Run by backup.service as the dashboard user.
set -euo pipefail
cd "$(dirname "$0")/.."

export BACKUP_DIR=/var/lib/dashboard/backups
export BACKUP_KEEP=14
DRIVE_FOLDER=drive:dashboard-backups

node scripts/backup.js

# Only the dated nightly copies go to Drive; pre-deploy snapshots stay on the VM.
rclone copy "$BACKUP_DIR" "$DRIVE_FOLDER" --include 'dashboard-[0-9]*'
rclone delete "$DRIVE_FOLDER" --min-age 30d
echo "Copied to $DRIVE_FOLDER"
