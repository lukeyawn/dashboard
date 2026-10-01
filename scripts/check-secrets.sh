#!/usr/bin/env bash
# Fails if a secret is tracked by git or shipped in the build (DESIGN §13).
set -euo pipefail
cd "$(dirname "$0")/.."

status=0

tracked_env=$(git ls-files | grep -E '(^|/)\.env(\..+)?$' | grep -vE '\.env\.example$' || true)
if [ -n "$tracked_env" ]; then
    echo "::error::.env files are tracked by git: $tracked_env"
    status=1
fi

# Google's secret iCal address: .../private-<hex>/basic.ics
ical='private-[0-9a-f]{16,}/basic\.ics'
if git ls-files -z | xargs -0 grep -nIE "$ical" --; then
    echo "::error::A private Google Calendar address is tracked by git"
    status=1
fi
if [ -d dist ] && grep -rnIE "$ical" dist; then
    echo "::error::A private Google Calendar address is in the build"
    status=1
fi

# Locally, also make sure the real token values never leave .env
if [ -f .env ]; then
    while IFS='=' read -r key value; do
        case "$key" in API_TOKEN|KIOSK_TOKEN|GCAL_ICS_URL|OAUTH_*_SECRET|OAUTH_REFRESH_KEY) ;; *) continue ;; esac
        [ -n "$value" ] || continue
        if git ls-files -z | xargs -0 grep -nIF "$value" -- >/dev/null; then
            echo "::error::The value of $key appears in a tracked file"
            status=1
        fi
        if [ -d dist ] && grep -rqIF "$value" dist; then
            echo "::error::The value of $key appears in the build"
            status=1
        fi
    done < .env
fi

[ "$status" -eq 0 ] && echo "No secrets found."
exit "$status"
