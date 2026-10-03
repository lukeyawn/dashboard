#!/usr/bin/env bash
# Adds what the claude.ai connectors need to .env (docs/CONNECTOR.md §10,
# docs/AGENT.md §6): the chat client's and the agent's client's IDs and
# secrets and the refresh-token key, each long and random, and PUBLIC_URL and
# TAILNET_URL when the public address is given.
# Never changes a value that's already there, so it's safe to run again. Run
# on the VM:
#   sudo bash /opt/dashboard/vm/oauth-client.sh https://dashboard.<tailnet>.ts.net
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
    # no port: claude.ai only connects to 443 (docs/CONNECTOR.md §3)
    case "$PUBLIC_URL" in
        https://*:* | https://*/* | https://) bad=1 ;;
        https://*) bad= ;;
        *) bad=1 ;;
    esac
    if [ -n "$bad" ]; then
        echo "PUBLIC_URL should look like https://dashboard.<tailnet>.ts.net, with no port or path: claude.ai only connects to port 443" >&2
        exit 1
    fi
    existing=$(sed -n 's/^PUBLIC_URL=//p' "$ENV_FILE")
    if [ -n "$existing" ] && [ "$existing" != "$PUBLIC_URL" ]; then
        echo "$ENV_FILE already has PUBLIC_URL=$existing. To change it, delete the PUBLIC_URL and TAILNET_URL lines, then run this again." >&2
        exit 1
    fi
    add PUBLIC_URL "$PUBLIC_URL"
    # the dashboard itself, tailnet-only on 8443
    add TAILNET_URL "$PUBLIC_URL:8443"
fi
add OAUTH_CHAT_CLIENT_ID "chat-$(token)"
add OAUTH_CHAT_CLIENT_SECRET "$(token)"
add OAUTH_REFRESH_KEY "$(token)"
add OAUTH_AGENT_CLIENT_ID "agent-$(token)"
add OAUTH_AGENT_CLIENT_SECRET "$(token)"
chmod 600 "$ENV_FILE"

if [ ${#added[@]} -eq 0 ]; then
    echo "Nothing to add: $ENV_FILE already has them."
else
    echo "Added to $ENV_FILE: ${added[*]}"
fi
echo "The client IDs and secrets to paste into claude.ai: sudo grep '^OAUTH_CHAT_CLIENT' $ENV_FILE for Dashboard, and sudo grep '^OAUTH_AGENT_CLIENT' $ENV_FILE for Dashboard (agent)"
