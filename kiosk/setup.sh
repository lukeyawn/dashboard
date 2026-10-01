#!/usr/bin/env bash
# One-time setup of the kiosk Pi (DESIGN §11.2). See kiosk/SETUP.md. Run as the
# desktop user, from the repo cloned to ~/dashboard:
#   DASHBOARD_URL=https://dashboard.<tailnet>.ts.net ~/dashboard/kiosk/setup.sh
set -euo pipefail

: "${DASHBOARD_URL:?Set DASHBOARD_URL to the Tailscale address of the dashboard}"
CONFIG="$HOME/.config/dashboard"

echo "== Packages"
sudo apt-get update -q
sudo apt-get install -y -q swayidle wlopm curl squeekboard

echo "== Time zone (must match TZ on the server)"
sudo timedatectl set-timezone America/Chicago

echo "== Settings"
mkdir -p "$CONFIG" "$HOME/.config/labwc"
printf 'DASHBOARD_URL=%s\n' "$DASHBOARD_URL" > "$CONFIG/kiosk.env"
if [ ! -s "$CONFIG/kiosk-token" ]; then
    read -rsp 'Paste the KIOSK_TOKEN from the server, then press Enter: ' token
    echo
    (umask 077 && printf '%s' "$token" > "$CONFIG/kiosk-token")
fi
chmod 600 "$CONFIG/kiosk-token"

echo "== Autostart"
if [ -f "$HOME/.config/labwc/autostart" ] && ! grep -q 'dashboard/kiosk' "$HOME/.config/labwc/autostart"; then
    cp "$HOME/.config/labwc/autostart" "$HOME/.config/labwc/autostart.before-dashboard"
fi
cp "$HOME/dashboard/kiosk/autostart" "$HOME/.config/labwc/autostart"

echo "== Checking the server"
if curl -fsS --max-time 5 -o /dev/null "$DASHBOARD_URL/api/health"; then
    echo "The server answers. Reboot to start the kiosk: sudo reboot"
else
    echo "The server doesn't answer at $DASHBOARD_URL yet. Is Tailscale up on this Pi (sudo tailscale up)?"
fi
