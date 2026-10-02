# server/

The Express server: the REST API under `/api`, the login flow, and, in production, the built frontend. It's one Node process on the VM, listening on `127.0.0.1:3000` behind `tailscale serve` on port 8443 (DESIGN §2, §11.1). It's the only program that opens the SQLite database. With `PUBLIC_URL` set, the same process also runs the claude.ai connector's public listener on `127.0.0.1:3002`, behind Tailscale Funnel on port 443 ([docs/CONNECTOR.md](../docs/CONNECTOR.md)).

Every `x.test.js` tests the `x.js` beside it. The exceptions are noted below.

## Start-up and wiring

| File | Purpose |
|---|---|
| `index.js` | Entry point (`npm start`, `npm run dev:server`). Reads `.env`, refuses weak tokens, opens the database, starts the calendar feed, and listens. |
| `app.js` | Builds the Express app without listening, so tests can run it on a random port. Mounts every route in order: health and login (no token), then `requireToken`, then the API, then the built frontend. |
| `testing.js` | Test helper: runs the app on a random port with a fresh in-memory database, optionally with the public listener and a helper that signs in the way claude.ai does. |
| `app.test.js` | Tests health, the tokens, login, the tasks API, the frontend files and the session. |
| `api.test.js` | Tests every other route. |

## Cross-cutting

| File | Purpose |
|---|---|
| `auth.js` | The two tokens, the login cookie, `requireToken`, and the global login rate limit (DESIGN §4, Access). |
| `errors.js` | `HttpError`, `validate` (zod), and the handler that turns errors into `{ error: { message, details } }`. |
| `db.js` | Opens SQLite and runs the numbered migrations in `migrations/` in order, tracked by `user_version`. |
| `crud.js` | The four generic routes every resource gets (list, create, update, delete) and the SQL behind them. Stores build on it. Every write goes through the change record in the same transaction. Creating an item whose `source` already exists returns the existing one. |
| `changes.js` | The change record (DESIGN §5.5): `withActor` tags every write in a request with who made it (owner, kiosk, Claude), and the log stores each row before and after. Kept a year. |
| `access.js` | What a claude.ai connector's token may do: an allow-list of routes per connector, and the chat connector's 100 writes a day (docs/CONNECTOR.md §5). |
| `clean.js` | Cleans text written through a connector (invisible and reordering characters) and refuses links that aren't https. |
| `limits.js` | Rate limits: the dashboard's login lockout, and the public listener's split limits, by connection, by visitor and per kind of traffic. |
| `undo.js` | Undoes one change, but only if the item is still exactly as that change left it; otherwise it answers 409. `undo.since` undoes everything matching since a time, skipping items edited since. `changes.test.js` covers it. |

## Features

| File | Purpose |
|---|---|
| `calendar.js` | Reads Google Calendar's private iCal feed every 10 minutes and expands repeating events into occurrences. Yearly all-day events become birthdays. Keeps the last good copy on disk. |
| `weather.js` | Current weather and today's high and low from Open-Meteo, cached per location for 30 minutes. |
| `night.js` | Whether night mode is in force, from the night hours and any early start (DESIGN §6.4). |
| `today.js` | `GET /api/today`: one snapshot of the day, mainly for Claude. |
| `status.js` | `GET /api/status`: the last nightly backup and the calendar feed, and any problem the dock should show. |
| `backup.js` | The full JSON export (`/api/export`) and the nightly snapshot used by `scripts/backup.js`. |
| `oauth.js` | Sign-in for the claude.ai connectors (OAuth 2.1): the metadata, `/oauth/authorize` (which only checks and redirects to the tailnet), `/oauth/token`, the tailnet approval API under `/api/connect`, and reading the connector's settings from `.env`. |
| `public.js` | The public listener, the only thing Tailscale Funnel exposes: just the MCP endpoint and the sign-in routes, with the token checked first. |
| `mcp.js` | The MCP endpoint for claude.ai: a fresh MCP server per request with `mcp/tools.js` (minus `delete_item`), calling the private API over loopback with the caller's own token. |
| `seed.js` | Development data (`npm run seed`). Only fills empty tables. **Never run it on the server.** |

## Subdirectories

| Directory | Purpose |
|---|---|
| `routes/` | Express routers. `resources.js` has each stored resource's routes and quick actions (complete, check, increment, advance). `system.js` has settings, night mode, weather, the kiosk's location, events and birthdays. `changes.js` has the change record and undo. `connections.js` has the claude.ai connectors' switches and connections, for `/manage`. |
| `stores/` | One file per table: its columns, ordering, filters and any special behavior. Examples: the pinned countdown is unique, goals increment, and habits compute streaks and checks. `stores.test.js` covers them all, and `tasks.test.js` covers tasks in more depth. `connections.js` holds claude.ai's connections and their tokens (as hashes), with its own test. |
| `migrations/` | Numbered SQL files, `001-tasks.sql` onward, applied once each in order. `008` moved deadlines into tasks, `009` added the change record, `010` the claude.ai sign-in tables, and `011` the connection behind each change. Numbers must have no gaps. A new table or column is a new file; an existing file never changes once deployed. |
| `fixtures/` | `calendar.ics`, a test calendar with repeats, skipped dates, changed occurrences, all-day events and birthdays. The calendar tests read it instead of touching the network. |
