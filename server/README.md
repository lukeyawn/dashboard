# server/

The Express server: the REST API under `/api`, the login flow, and, in production, the built frontend. It's one Node process on the VM, listening on `127.0.0.1:3000` behind `tailscale serve` on port 8443 (DESIGN §2, §11.1). It's the only program that opens the SQLite database. With `PUBLIC_URL` set, the same process also runs the claude.ai connector's public listener on `127.0.0.1:3002`, behind Tailscale Funnel on port 443 ([docs/CONNECTOR.md](../docs/CONNECTOR.md)).

Every `x.test.js` tests the `x.js` beside it. The exceptions are noted below.

## Start-up and wiring

| File | Purpose |
|---|---|
| `index.js` | Entry point (`npm start`, `npm run dev:server`). Reads `.env`, refuses weak tokens, opens the database, starts the calendar feeds (the main one, and classes if `GCAL_ROUTINE_ICS_URL` is set), and listens. |
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
| `crud.js` | The four generic routes every resource gets (list, create, update, delete) and the SQL behind them. Stores build on it. Every write goes through the change record in the same transaction. Creating an item whose `source` already exists returns the existing one (and an area whose name exists). Columns can be stored as JSON (a task's `repeat`). |
| `changes.js` | The change record (DESIGN §5.5): `withActor` tags every write in a request with who made it (owner, kiosk, Claude), the claude.ai connection and the agent's run, and the log stores each row before and after. Kept for good; the ✦ mark on what Claude created lasts a year. It also says which values Claude wrote, so a link Claude added asks before it opens. |
| `access.js` | What a claude.ai connector's token may do: an allow-list of routes per connector, and each one's daily cap, 100 writes for chats and 30 for the agent (docs/CONNECTOR.md §5, docs/AGENT.md §2). Reporting a run skips the cap, and `requireRun` opens the run an agent write names by label, or refuses the write (§7). |
| `clean.js` | Cleans text written through a connector (invisible and reordering characters) and refuses links that aren't https. |
| `limits.js` | Rate limits: the dashboard's login lockout, and the public listener's split limits, by connection, by visitor and per kind of traffic. |
| `undo.js` | Undoes one change, but only if the item is still exactly as that change left it, compared column by column (columns added since are ignored, and a copy with a column the table no longer has is refused); otherwise it answers 409. A clash with another row (two pinned countdowns, a taken name or source) is a 409 too. `undo.since` undoes everything matching since a time, or one of the agent's runs, skipping what it can't undo. `changes.test.js` covers it. |

## Features

| File | Purpose |
|---|---|
| `calendar.js` | Reads Google Calendar's private iCal feed every 10 minutes and expands repeating events into occurrences. Yearly all-day events become birthdays. Keeps the last good copy on disk. `combineFeeds` merges the optional classes calendar in, tagging its events `routine`. |
| `weather.js` | Current weather and today's high and low from Open-Meteo, cached per location for 30 minutes. |
| `night.js` | Whether night mode is in force, from the night hours and any early start (DESIGN §6.4). |
| `today.js` | `GET /api/today`: one snapshot of the day, mainly for Claude, with the tasks split into `assignments` and `tasks` as the tiles show them. |
| `status.js` | `GET /api/status`: the last nightly backup, the calendar feeds, the connectors (a lost connection, a used-up day) and the agent's runs (one that didn't report, none in 26 hours), and any problem the dock should show. |
| `backup.js` | The full JSON export (`/api/export`) and the nightly snapshot used by `scripts/backup.js`. |
| `oauth.js` | Sign-in for the claude.ai connectors (OAuth 2.1): the metadata, `/oauth/authorize` (which only checks and redirects to the tailnet), `/oauth/token`, the tailnet approval API under `/api/connect`, and reading the connector's settings from `.env`. |
| `public.js` | The public listener, the only thing Tailscale Funnel exposes: just the MCP endpoint and the sign-in routes, with the token checked first. |
| `mcp.js` | The MCP endpoints for claude.ai: a fresh MCP server per request with `mcp/tools.js`, calling the private API over loopback with the caller's own token. Chats get every tool but `delete_item`; the agent also goes without settings and night mode, and alone gets `report_run` and a run label on every write. |
| `seed.js` | Development data (`npm run seed`). Only fills empty tables. **Never run it on the server.** |

## Subdirectories

| Directory | Purpose |
|---|---|
| `routes/` | Express routers. `resources.js` has each stored resource's routes and quick actions (check, increment, achieve). `system.js` has settings, night mode, weather, the kiosk's location, events and birthdays. `changes.js` has the change record and undo. `connections.js` has the claude.ai connectors' switches and connections, for `/manage`. `runs.js` has the agent's runs: the list and `report_run` (docs/AGENT.md §7). |
| `stores/` | One file per table: its columns, ordering, filters and any special behavior. Examples: the pinned countdown is unique, goals increment, habits compute streaks and checks, a recurring task rolls forward when completed, deleting an area (`areas.js`) clears it from its tasks, `settings.js` refuses an Assignments area that doesn't exist and keeps `agent_seen_at` out of the change record, applications (`applications.js`) say whether Claude wrote their link, and goals (`goals.js`) add their step, are achieved on reaching their target, and sum their progress this week from the change record. `stores.test.js` covers them all, and `tasks.test.js` covers tasks in more depth. `connections.js` holds claude.ai's connections and their tokens (as hashes), with its own test. `runs.js` holds the agent's runs: opened by the first change with a new label (with the daily cap from `agent_runs_per_day`) and closed by the report, on the server's clock, open for 3 hours, reported once (`api.test.js` and `access.test.js` cover it). |
| `migrations/` | Numbered SQL files, `001-tasks.sql` onward, applied once each in order. `008` moved deadlines into tasks, `009` added the change record, `010` the claude.ai sign-in tables, `011` the connection behind each change, `012` a habit's weekly target, `013` a countdown's time and `detail`, `014` task areas, now/soon/someday, minutes and recurrence, rebuilding `tasks` (each rewriting the change record's copies of its rows to match), `015` School as the Assignments tile's area, `016` goal kinds, deadlines, steps, achieved_at and dreams, rebuilding `goals`, `017` the OA and withdrawn stages and an application's next step, and `018` the to-apply stage, each rebuilding `applications`, `019` the agent's runs and the run behind each change, and `020` run labels. Numbers must have no gaps. A new table or column is a new file; an existing file never changes once deployed. |
| `fixtures/` | `calendar.ics`, a test calendar with repeats, skipped dates, changed occurrences, all-day events and birthdays. The calendar tests read it instead of touching the network. |
