#!/usr/bin/env bash
# Adds what the claude.ai connector needs to .env (docs/CONNECTOR.md §10):
# the chat client's ID and secret and the refresh-token key, each long and
# random, and PUBLIC_URL when it's given. Never changes a value that's
# already there, so it's safe to run again. Run on the VM:
#   sudo bash /opt/dashboard/vm/oauth-client.sh https://dashboard.<tailnet>.ts.net:8443
# ENV_FILE overrides which file (for tests). Restart the dashboard afterwards.
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/dashboard/.env}"
PUBLIC_URL="${1:-}"

if [ ! -f "$ENV_FILE" ]; then
    echo "No $ENV_FILE. Run vm/setup.sh first." >&2
    exit 1
fi

token() { head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n'; }

added=()
add() {
    if ! grep -q "^$1=" "$ENV_FILE"; then
        # a file without a final newline would glue the new line onto the last one
        [ -s "$ENV_FILE" ] && [ -n "$(tail -c 1 "$ENV_FILE")" ] && echo >> "$ENV_FILE"
        echo "$1=$2" >> "$ENV_FILE"
        added+=("$1")
    fi
}

if [ -n "$PUBLIC_URL" ]; then
    case "$PUBLIC_URL" in
        https://*:8443) ;;
        *) echo "PUBLIC_URL should look like https://dashboard.<tailnet>.ts.net:8443" >&2; exit 1 ;;
    esac
    add PUBLIC_URL "$PUBLIC_URL"
fi
add OAUTH_CHAT_CLIENT_ID "chat-$(token)"
add OAUTH_CHAT_CLIENT_SECRET "$(token)"
add OAUTH_REFRESH_KEY "$(token)"
chmod 600 "$ENV_FILE"

if [ ${#added[@]} -eq 0 ]; then
    echo "Nothing to add: $ENV_FILE already has them."
else
    echo "Added to $ENV_FILE: ${added[*]}"
fi
echo "The client ID and secret to paste into claude.ai: sudo grep '^OAUTH_CHAT_CLIENT' $ENV_FILE"
