#!/usr/bin/env bash
# Started by labwc's autostart (DESIGN §11.2). Waits until the server answers,
# opens the kiosk's login link, and starts Chromium again if it ever exits.
set -u

CONFIG="$HOME/.config/dashboard"
# shellcheck source=/dev/null
. "$CONFIG/kiosk.env"
TOKEN=$(cat "$CONFIG/kiosk-token")
CHROMIUM=$(command -v chromium || command -v chromium-browser)

wait_for_server() {
    until curl -fsS --max-time 5 -o /dev/null "$DASHBOARD_URL/api/health"; do sleep 5; done
}

while true; do
    # never open the page while the server can't be reached: it would show an error page
    wait_for_server
    "$CHROMIUM" \
        --kiosk --noerrdialogs --disable-pinch --overscroll-history-navigation=0 \
        --ozone-platform=wayland --enable-wayland-ime \
        --no-first-run --disable-session-crashed-bubble --password-store=basic \
        "$DASHBOARD_URL/login?token=$TOKEN"
    sleep 3
done
