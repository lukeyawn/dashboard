# Restoring the database

There are three copies to restore from, newest first. Try them on a copy first (step 1 of each), and only replace the live database once the copy checks out.

All commands run on the VM (`ssh dashboard`).

## From Litestream: any moment in the last 30 days

```sh
# the latest state, or a past one with -timestamp (UTC)
sudo litestream restore -o /tmp/restored.db gs://<bucket>/dashboard
sudo litestream restore -timestamp 2026-10-01T08:00:00Z -o /tmp/restored.db gs://<bucket>/dashboard
```

## From last night's snapshot on the VM, or a pre-deploy one

```sh
ls -lt /var/lib/dashboard/backups
cp /var/lib/dashboard/backups/dashboard-2026-10-01.db /tmp/restored.db
```

Before every deploy, `vm/deploy.sh` saves `dashboard-pre-deploy-<commit>.db`. That's the one to restore if a deploy's migration went wrong.

## From Google Drive: if the VM itself is gone

```sh
sudo -u dashboard rclone copy drive:dashboard-backups/dashboard-2026-10-01.db /tmp/
```

The `.json` beside each snapshot is the full export. It's readable without SQLite, even with no server at all.

## Check the copy, then swap it in

```sh
sqlite3 /tmp/restored.db 'PRAGMA integrity_check;'      # must print "ok"
sqlite3 /tmp/restored.db 'SELECT count(*) FROM tasks;'  # looks about right?

sudo systemctl stop dashboard litestream
cd /var/lib/dashboard
sudo mv dashboard.db dashboard.db.before-restore
sudo rm -f dashboard.db-wal dashboard.db-shm
sudo install -o dashboard -g dashboard -m 640 /tmp/restored.db dashboard.db
sudo systemctl start dashboard litestream
```

Check the dashboard, then delete `dashboard.db.before-restore` once you're sure.

**On a new VM:** run [SETUP.md](SETUP.md) first, then restore as above. Litestream picks up from the restored database on its own.

## Restore drill

Do this once after setup, and again after any Litestream upgrade (DESIGN §2): restore from each of the three copies to `/tmp`, run the two checks, and delete the copies. A backup that has never been restored isn't known to work.
