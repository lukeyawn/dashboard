# vm/

Everything for the Google Cloud VM that runs the server and holds the database (DESIGN §11.1). **[SETUP.md](SETUP.md)** is the one-time setup guide, and **[RESTORE.md](RESTORE.md)** is how to get the data back, and **[CONNECTOR.md](CONNECTOR.md)** connects claude.ai, and **[AGENT.md](AGENT.md)** sets up the scheduled agent.

| File | Purpose |
|---|---|
| `SETUP.md` | One-time setup: the Google Cloud project, bucket, service account and VM, then Tailscale, `.env` and the Google Drive copy. |
| `CONNECTOR.md` | Turning on the claude.ai connectors: the client secrets, Tailscale Funnel on port 443 with the dashboard on 8443, the checks, adding the chat connector and then the agent's in claude.ai, and turning them off. |
| `AGENT.md` | Setting up the scheduled agent in claude.ai (phase 9): the Gmail label and its one allowed tool, the task and its schedule, checks, and the agent's instructions, ready to paste. |
| `RESTORE.md` | Restoring the database from Litestream (any moment in the last 30 days), a snapshot on the VM, or the copies in Google Drive, and the restore drill. Practice on copies only. |
| `setup.sh` | Run once on the VM, and safe to run again. Installs Node, Litestream and rclone, creates the `dashboard` user, clones the repo to `/opt/dashboard`, writes `.env` with new tokens, and installs the services below. |
| `oauth-client.sh` | Adds the claude.ai connectors' client IDs and secrets (chat and agent) and the refresh key (and `PUBLIC_URL` and `TAILNET_URL`, if given) to `.env`, never changing what's there. `setup.sh` runs it; `oauth-client.test.js` tests it. |
| `deploy.sh` | Run from the laptop. Refuses a commit whose CI didn't pass, builds the frontend locally, snapshots the database, then updates and restarts the server over Tailscale SSH. |
| `dashboard.service` | The systemd service for the server. |
| `litestream.yml` | Continuous backup of the database to the Cloud Storage bucket, kept 30 days. |
| `backup.sh` | The nightly backup: a snapshot and the JSON export, kept 14 nights on the VM and copied to Google Drive for 30. Records how it went in `last-run.json`, which the dock's status line reads. |
| `backup.service`, `backup.timer` | Run `backup.sh` at 03:00 dashboard time, catching up after downtime. |
| `backup.test.js` | Runs `backup.sh` for real on a temporary database, with a fake `rclone`. |
