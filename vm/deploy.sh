#!/usr/bin/env bash
# Deploys the latest commit on main to the VM (DESIGN §11.1). Run from the laptop:
#   vm/deploy.sh            (DASHBOARD_HOST overrides the VM's Tailscale name, "dashboard")
# Refuses a commit whose CI didn't pass, builds the frontend here rather than
# on the 1 GB VM, and snapshots the database before restarting.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${DASHBOARD_HOST:-dashboard}"

git fetch --quiet origin main
sha=$(git rev-parse origin/main)
short=${sha:0:12}

conclusion=$(gh run list --commit "$sha" --workflow CI --json conclusion --jq '.[0].conclusion // "none"')
if [ "$conclusion" != success ]; then
    echo "CI for $short is '$conclusion', not 'success'. Not deploying."
    exit 1
fi

echo "== Building $short"
work=$(mktemp -d)
trap 'git worktree remove --force "$work" >/dev/null 2>&1 || rm -rf "$work"' EXIT
git worktree add --detach --quiet "$work" "$sha"
(cd "$work" && npm ci --silent && BUILD="$sha" npm run build --silent)

echo "== Copying the build to $HOST"
rsync -az --delete "$work/dist/" "$HOST:/tmp/dashboard-dist/"

echo "== Updating $HOST"
# shellcheck disable=SC2087 # $sha is meant to expand here, on the laptop
ssh "$HOST" sudo bash -s <<REMOTE
set -euo pipefail
cd /opt/dashboard
as_dashboard() { sudo -u dashboard bash -c "set -a; . ./.env; set +a; \$1"; }

# a snapshot first, so a bad migration can be rolled back (vm/RESTORE.md)
as_dashboard "BACKUP_DIR=/var/lib/dashboard/backups node scripts/backup.js pre-deploy-$short"
ls -t /var/lib/dashboard/backups/dashboard-pre-deploy-* 2>/dev/null | tail -n +11 | xargs -r rm --

sudo -u dashboard git fetch --quiet origin
sudo -u dashboard git checkout --quiet --detach $sha
sudo -u dashboard npm ci --omit=dev --silent

rm -rf dist.new && cp -r /tmp/dashboard-dist dist.new && chown -R dashboard:dashboard dist.new
rm -rf dist && mv dist.new dist
echo "BUILD=$sha" > build.env

systemctl restart dashboard
for _ in \$(seq 1 30); do
    if curl -fsS -D - -o /dev/null http://127.0.0.1:3000/api/health 2>/dev/null | grep -qi "x-build: $sha"; then
        echo "Serving $short."
        exit 0
    fi
    sleep 1
done
echo "The server didn't come back on $short. See: sudo journalctl -u dashboard -n 50"
exit 1
REMOTE
