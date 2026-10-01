#!/usr/bin/env bash
# One-time setup of the Google Cloud VM (DESIGN §11.1). vm/SETUP.md says when to run it:
#   sudo LITESTREAM_BUCKET=<bucket name> bash setup.sh
# Safe to run again: it skips what's already done.
set -euo pipefail

: "${LITESTREAM_BUCKET:?Set LITESTREAM_BUCKET to the Cloud Storage bucket name}"
REPO=https://github.com/lukeyawn/dashboard.git
LITESTREAM_VERSION=0.5.17
APP=/opt/dashboard
DATA=/var/lib/dashboard

echo "== Packages"
apt-get update -q
apt-get install -y -q git curl rsync sqlite3 rclone ca-certificates

if ! node --version 2>/dev/null | grep -q '^v24\.'; then
    echo "== Node 24"
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    apt-get install -y -q nodejs
fi

if ! litestream version 2>/dev/null | grep -q "$LITESTREAM_VERSION"; then
    echo "== Litestream $LITESTREAM_VERSION"
    curl -fsSL -o /tmp/litestream.deb \
        "https://github.com/benbjohnson/litestream/releases/download/v$LITESTREAM_VERSION/litestream-$LITESTREAM_VERSION-linux-x86_64.deb"
    dpkg -i /tmp/litestream.deb
fi

echo "== The dashboard user and its data directory"
id dashboard >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --create-home --shell /usr/sbin/nologin dashboard
install -d -o dashboard -g dashboard -m 750 "$DATA" "$DATA/backups"

echo "== The code"
if [ ! -d "$APP/.git" ]; then
    install -d -o dashboard -g dashboard "$APP"
    sudo -u dashboard git clone --quiet "$REPO" "$APP"
fi
sudo -u dashboard bash -c "cd $APP && npm ci --omit=dev --silent"

if [ ! -f "$APP/.env" ]; then
    echo "== .env with two new tokens"
    token() { node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"; }
    cat > "$APP/.env" <<ENV
API_TOKEN=$(token)
KIOSK_TOKEN=$(token)
GCAL_ICS_URL=
TZ=America/Chicago
PORT=3000
HOST=127.0.0.1
DATABASE=$DATA/dashboard.db
ENV
    chown dashboard:dashboard "$APP/.env"
    chmod 600 "$APP/.env"
fi

echo "== Services"
sed "s/LITESTREAM_BUCKET/$LITESTREAM_BUCKET/" "$APP/vm/litestream.yml" > /etc/litestream.yml
install -m 644 "$APP/vm/dashboard.service" "$APP/vm/backup.service" "$APP/vm/backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dashboard.service
# the server creates the database on its first start; Litestream then follows it
sleep 2
systemctl enable --now litestream.service
systemctl restart litestream.service
systemctl enable --now backup.timer

echo
echo "Done. Next steps are in vm/SETUP.md (Tailscale, the calendar address, Google Drive)."
echo "The tokens are in $APP/.env: sudo cat $APP/.env"
