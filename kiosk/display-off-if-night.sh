#!/usr/bin/env bash
# Run by swayidle after 6 idle minutes (DESIGN §6.4). Turns the display off,
# but only when it's night. The server decides; if it can't be reached, the
# night hours it gave last time decide, so an internet outage doesn't keep
# the screen lit all night.
#
# Reads ~/.config/dashboard/kiosk.env (DASHBOARD_URL) and ~/.config/dashboard/kiosk-token.
# DASHBOARD_NOW=HH:MM pretends it's that time, for tests.
set -uo pipefail

CONFIG="$HOME/.config/dashboard"
CACHE="$HOME/.cache/dashboard-night.json"
# shellcheck source=/dev/null
. "$CONFIG/kiosk.env"
TOKEN=$(cat "$CONFIG/kiosk-token")

field() { # field NAME JSON: a value from the night answer, which is flat JSON
    printf '%s' "$2" | grep -o "\"$1\":[^,}]*" | head -n 1 | cut -d: -f2- | tr -d '"'
}

minutes() { # HH:MM -> minutes since midnight
    echo $(( 10#${1%%:*} * 60 + 10#${1##*:} ))
}

in_night_hours() { # in_night_hours START END: wraps past midnight when START > END
    local now s e
    now=$(minutes "${DASHBOARD_NOW:-$(date +%H:%M)}")
    s=$(minutes "$1")
    e=$(minutes "$2")
    if [ "$s" -eq "$e" ]; then return 1; fi
    if [ "$s" -lt "$e" ]; then [ "$now" -ge "$s" ] && [ "$now" -lt "$e" ]; else [ "$now" -ge "$s" ] || [ "$now" -lt "$e" ]; fi
}

if answer=$(curl -fsS --max-time 5 -H "Authorization: Bearer $TOKEN" "$DASHBOARD_URL/api/night"); then
    mkdir -p "$(dirname "$CACHE")"
    printf '%s\n' "$answer" > "$CACHE"
    active=$(field active "$answer")
elif [ -f "$CACHE" ]; then
    saved=$(cat "$CACHE")
    active=false
    in_night_hours "$(field start "$saved")" "$(field end "$saved")" && active=true
else
    # nothing known: leave the screen on
    exit 0
fi

if [ "$active" = true ]; then
    wlopm --off '*'
fi
