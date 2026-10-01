# The dashboard's MCP server

This is the stdio server for Claude Code and Claude Desktop. For claude.ai, the server itself hosts the same tools at a public address; see [vm/CONNECTOR.md](../vm/CONNECTOR.md).

Lets a Claude agent read and change the dashboard: tasks (with due dates, priority and effort), countdowns, goals, habits, job applications and settings, plus read-only events and birthdays (DESIGN §5). It runs on the laptop, wherever Claude runs, and talks to the dashboard's API over Tailscale.

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

## Files

| File | Purpose |
|---|---|
| `index.js` | The entry point Claude starts over stdio. Reads `DASHBOARD_URL` and `DASHBOARD_TOKEN` and registers the tools. |
| `client.js` | A thin client over the REST API: each tool call is one HTTP request, so all validation and logic stay in the server. |
| `tools.js` | The tools and their descriptions, and the instructions sent to Claude on connecting. Input schemas come from `shared/schemas.js`, the same ones the API validates with. The server also hosts these tools over HTTP for claude.ai (`server/mcp.js`), minus `delete_item`. |
| `tools.test.js` | Every tool against the real API, over an in-memory MCP connection. |
| `index.test.js` | Starts `index.js` the way Claude does, over stdio, against a test server. |
