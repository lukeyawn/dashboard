# The dashboard's MCP server

Lets a Claude agent read and change the dashboard: tasks, deadlines, countdowns, goals, habits, job applications and settings, plus read-only events and birthdays (DESIGN §5). It runs on the laptop, wherever Claude runs, and talks to the dashboard's API over Tailscale.

It needs two settings:

| Variable | Value |
|---|---|
| `DASHBOARD_URL` | `https://dashboard.<tailnet>.ts.net` |
| `DASHBOARD_TOKEN` | the `API_TOKEN` from the server's `.env` (not the kiosk's token) |

## Claude Code

From the repo, once:

```sh
claude mcp add dashboard --scope user \
  --env DASHBOARD_URL=https://dashboard.<tailnet>.ts.net \
  --env DASHBOARD_TOKEN=<API_TOKEN> \
  -- node "$(pwd)/mcp/index.js"
```

Claude Code runs in WSL on this laptop, so WSL itself must reach the tailnet. Either install Tailscale inside WSL, or turn on WSL's mirrored networking (`networkingMode=mirrored` in `%UserProfile%\.wslconfig`) and use Tailscale on Windows. Check with `curl https://dashboard.<tailnet>.ts.net/api/health`, which should print nothing and succeed.

## Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dashboard": {
      "command": "node",
      "args": ["C:\\path\\to\\dashboard\\mcp\\index.js"],
      "env": {
        "DASHBOARD_URL": "https://dashboard.<tailnet>.ts.net",
        "DASHBOARD_TOKEN": "<API_TOKEN>"
      }
    }
  }
}
```

## Events and birthdays

Those live in Google Calendar, so this server only reads them. To add one, Claude uses its Google Calendar connector; a birthday is an all-day event repeating yearly. The tool descriptions tell the agent this.

## Trying it locally

Against the development server (`npm run dev:server`), with `DASHBOARD_URL=http://localhost:3001` and the `API_TOKEN` from your local `.env`.
