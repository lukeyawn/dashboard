# Dashboard — Final Design

Sep 30, 2026 (revised the same day: cloud hosting, any screen size, testing and CI) · Luke (owner, design and review) · Claude (implementation)

This replaces `DESIGN.md` and `DESIGN2.md` at the repo root. Everything here is decided unless it's listed under [Open questions](#16-open-questions). Where a decision has a reason, the reason is what counts: use it to judge cases the rule doesn't cover. Where this doc changes something in the earlier ones, [§17](#17-what-changed-from-the-earlier-docs) says what changed and why.

Choices made while building, where this doc left room, are logged in [DECISIONS.md](DECISIONS.md). Phase 8's detailed design, the claude.ai connectors, is in [CONNECTOR.md](CONNECTOR.md), and the scheduled agent's connector (Oct 2) in [AGENT.md](AGENT.md). §5 here only summarizes them; the longer text it had before is in [archive/](archive/DESIGN-5-agent-access.md). The redesign of the blocks (Oct 2) is in [BLOCKS.md](BLOCKS.md); until each part is built, it's newer than §10 here.

**How the work is split:** Luke decides the design and reviews the code, and Claude writes it. The original plan was for Luke to hand-write the code with AI help, but there's no longer time for that.

---

## 1. Product

A personal life dashboard for a CS + math student: schedule, deadlines, tasks, habits, goals and the internship search on one screen. It's not a note-taking app; Obsidian stays for math notes.

**Where it runs:**
- **The kiosk:** a **Raspberry Pi 5** driving a **wall-mounted touchscreen**. The screen's size and resolution haven't been chosen, so the layout works on any landscape screen (§7, §9). The Pi only displays the dashboard. It holds no data and doesn't have to stay on.
- **The server and the data:** a small always-on VM on Google Cloud's free tier (§11). It's reachable whether or not the Pi is on.
- **Other screens:** the same app opens in a normal browser on a laptop or phone, from anywhere (§4, Access). The `/manage` page is built for this.

**Two viewing distances:**
- **Across the room:** only the glanceable items need to be readable: the clock, today's date, the current and next event, and the countdown. These are sized large (§8).
- **Up close:** everything else is read when you walk up to the screen to touch it.

**Priorities, in order:**
1. Own the data: plain SQLite, no proprietary format.
2. Stay readable in ten years: plain JS, plain CSS, few dependencies.
3. Build features natively rather than through plugins, to avoid Obsidian-style plugin hell.
4. Portfolio value.

**Principles:**
- Everything important for today is visible at a glance on the dashboard, with no scrolling and no navigation.
- There are three ways to put data in, and all three use the same API:
  1. Tapping and typing on the kiosk touchscreen.
  2. A `/manage` page, usable from a laptop or phone.
  3. A Claude agent, through an MCP server.
- Events and birthdays are the exception: they live in **Google Calendar**, and the dashboard only reads them (§4).
- Updating something small (ticking a task or habit, +1 on a goal) takes one tap.

**Non-goals:**
- Multiple users or accounts.
- A mobile layout for the dashboard. The `/manage` page does have to work on a phone.
- Portrait screens for the dashboard. It's a landscape wall display.
- Editing Google Calendar events from the dashboard. Use the Google Calendar app, or Claude's Google Calendar connector.
- A generic plugin system or a schema-agnostic database. There's one developer, and third-party extensibility isn't a goal.
- A custom drag-and-drop kanban. If ever needed, use GitHub Projects or Trello.
- A home-built rich-text editor. If ever needed, use Tiptap, Lexical or CodeMirror.
- Recurring auto-generated tasks such as laundry or rent. They'd be a separate, harder widget later. The principle behind this: no "I'll do X on day Y" scheduling; if it's on the list, just get it done.

---

## 2. Architecture

```
Claude Desktop / Claude Code (laptop)                 Google Calendar
   │ stdio                                               │ private iCal feed
   ▼                                                     ▼
MCP server (mcp/) ─────┐       ┌─────────────────────────────────────────────┐
                       │       │ Google Cloud VM (free-tier e2-micro)        │
Kiosk: Pi 5 + Chromium ┼ HTTPS ► Express (server/) ──► SQLite (data/)       │
                       │ over  │   serves /api and the built frontend        │
Phone / laptop browser ┘ Tailscale, port 8443                                │
                               └──────────────┬──────────────────────────────┘
                                              ├─ Litestream, continuous ────► Cloud Storage bucket
                                              └─ nightly snapshot + export ─► Google Drive folder

claude.ai (chats, agent) ── HTTPS, Funnel port 443 ──► /mcp and /mcp/agent only, on their own listener (phase 8, CONNECTOR.md)
```

**Stack:**
- Frontend: React 19 with Vite and plain CSS.
- Backend: Node 24 LTS with Express 5 and `better-sqlite3`. The Node version is pinned in `.nvmrc` and in `package.json`'s `engines`.
- Calendar: `node-ical` reads Google's private iCal feed.
- Agent access: an MCP server built on `@modelcontextprotocol/sdk`.
- Validation: `zod`.
- Backups: Litestream (continuous) and rclone (nightly). Both are standalone programs on the VM, not npm dependencies.
- Tests: Vitest, plus Playwright for layout checks (§13).
- Everything is JavaScript, not TypeScript, to match the existing code.

**Why Express rather than FastAPI:** One language across the stack. It also means a single process on the VM, which serves both `/api` and the built frontend.

**Why `better-sqlite3`:** It's synchronous, so there are no async queries to reason about, and it's the most widely used SQLite driver for Node, with prebuilt binaries for x64 and ARM64.

**Why a cloud VM rather than the Pi:** The Pi won't always be on, and `/manage` and Claude need the data whenever they're used. On the VM the data is still one plain SQLite file, exactly as it would have been on the Pi.

**Why not Google Drive, OneDrive or Dropbox for the database:** They store files but can't run the server, and a live SQLite file in a synced folder gets corrupted: the sync client can copy it halfway through a write, and a second writer produces "conflicted copy" files. Drive holds the nightly backups instead (see Data durability).

**Why not a serverless platform** (such as Cloudflare Workers with D1): It's free with nothing to maintain, but the server would be rewritten for a different runtime, and the database would be a managed service rather than a file you hold. That works against priorities 1 and 2.

**Ports:**
- In development, Vite runs on 5173 and proxies `/api` to Express on 3001.
- In production, Express runs on port 3000 and listens on `127.0.0.1` only. `tailscale serve` is the only way in (§4).

### Repo layout

```
index.html
.nvmrc                    Node version, used locally, in CI and on the VM
LICENSE                   MIT
.github/
  workflows/ci.yml        CI (§13)
  dependabot.yml          weekly grouped updates for npm and GitHub Actions
src/                      frontend
  main.jsx                picks <App/>, <Manage/> or <Login/> from location.pathname (no router library)
  App.jsx                 dashboard: Page > Dashboard > WidgetShell × 9, plus Dock
  layout.js               area names and spans, as data (see §7)
  widgets/<name>/         one folder per widget: <Name>Widget.jsx, <Name>Widget.css, <Name>Widget.test.jsx
  components/             shared pieces: WidgetShell, Dashboard, Page, Dock, Modal
  editors/                one form/editor per resource, used by both /manage and the dashboard modal
  manage/Manage.jsx       the /manage page
  login/Login.jsx         the token screen (§4, Access)
  hooks/                  useNow, useResource, usePendingAction, useIdle, useBuildCheck
  lib/                    api.js (fetch wrapper)
  styles/                 tokens.css, base.css, fonts.css
  data/words.json         word-of-the-day list
  config.js               code constants (pending delay, idle timeouts); user settings live in the database
  scratch/                practice code, including the old exercises.jsx; committed, never imported by App
server/
  index.js                starts the app: opens the database, listens on the port
  app.js                  builds the Express app without listening (routes, auth, static files, SPA fallback for /manage and /login),
                          so tests can run it on a random port with an in-memory database
  db.js                   opens the database, runs migrations
  calendar.js             fetches and caches the Google iCal feeds (main and classes), expands repeating events
  weather.js              picks the weather location and fetches Open-Meteo (§10, Dock)
  night.js                night-hours logic (§6.4)
  migrations/NNN-*.sql    numbered, applied at startup, tracked with PRAGMA user_version
  routes/<resource>.js
  seed.js                 dev seed data (today's placeholder arrays from App.jsx move here)
  **/*.test.js            tests live next to the code they test
shared/
  schemas.js              zod schemas used by src/, server/ and mcp/
  dates.js                local-date helpers, used everywhere dates are handled (§14)
mcp/
  index.js                MCP server (stdio), a thin client over the REST API
e2e/
  layout.spec.js          Playwright layout checks at every supported resolution (§13)
  fixtures/               mock API data for the layout checks, including very long names
vm/                       server setup: systemd units, Litestream config, backup script and timer, deploy.sh, RESTORE.md
kiosk/                    Pi setup: labwc autostart, swayidle config, night-mode script
data/                     gitignored: dashboard.db, backups/, calendar-cache/
.env                      gitignored: API_TOKEN, KIOSK_TOKEN, GCAL_ICS_URL, GCAL_ROUTINE_ICS_URL (optional), TZ
docs/DESIGN.md            this file
```

**How the code is organized:** by feature, not by kind. Each widget lives with its own CSS and tests. Shared components are extracted only once three places need them (the rule of three). For example, several widgets render lists (tasks, deadlines, applications), but there's no generic `ListWidget` until that duplication actually hurts. `WidgetShell` is the exception: container queries need an ancestor to query.

`src/scratch/` is committed, not gitignored. An ignored folder that `App` imports from would break a fresh clone.

**Secrets:** The two tokens and the private iCal URL are passwords: anyone with a token can change the data, and anyone with the URL can read the calendar. They live only in `.env` on the VM, and the kiosk token also in one file on the Pi. They never go in the repo or the frontend bundle. The repo is public, so CI also checks for them (§13).

### Where the data lives

Everything lives on the VM, except events, which are Google's.

| Data | Where | Notes |
|---|---|---|
| Tasks, deadlines, countdowns, goals, habits, applications, settings | `data/dashboard.db`, one SQLite file on the VM | The live copy. Express is the only program that opens it. |
| Continuous backup | A Google Cloud Storage bucket, through Litestream | Every change within seconds. Can be restored to any moment in the last 30 days. |
| Nightly backup | A Google Drive folder, through rclone | A database snapshot plus the JSON export, for the last 30 nights. |
| Events and birthdays | Google Calendar | A copy of the feed is cached in `data/calendar-cache/`, so the timeline still works when Google can't be reached. |
| Word list | `src/data/words.json` | Part of the code, versioned in git. |
| Weather | Nowhere durable | The server fetches it from Open-Meteo and caches it in memory. The kiosk's last reported location is a setting (§10, Dock). |
| Secrets | `.env` on the VM; the kiosk token also in a file on the Pi | Never committed. |
| In the browser | Only the login cookie (§4, Access) | Browsers hold no data of their own; the kiosk, `/manage` and Claude all read the same database through the API. |

`data/` is gitignored, so the database is never committed. Moving to a new VM means restoring the database from Litestream (`vm/RESTORE.md`) and copying `.env`.

### Data durability

- **Continuous:** Litestream streams every change to a Cloud Storage bucket in the VM's region and keeps 30 days of history. If the VM is lost, at most the last few seconds of changes go with it.
- **Nightly:** at 03:00 a systemd timer makes a snapshot with `VACUUM INTO` and writes the JSON export, then rclone copies both to a Google Drive folder and keeps the last 30. The JSON stays readable without SQLite.
- **Both copies are in your Google account.** If that ever feels like too many eggs in one basket, rclone can point at any other storage.
- **Restores are tested.** `vm/RESTORE.md` walks through restoring from each copy. It's tried once when the VM is set up and again after any Litestream upgrade, because a backup that has never been restored isn't known to work.
- **Export:** `GET /api/export` returns every table as one JSON document.
- **Long-form content:** Short structured fields go in a table row. Paragraphs of prose would go in markdown files, with SQLite as an index. No v1 feature needs prose files; application notes are a text column.
- **Events** are backed up by Google, not by this app.

---

## 3. Data model

**Conventions:**
- Every table has `id INTEGER PRIMARY KEY`, `created_at` and `updated_at`. The exceptions are `habit_checks` and `settings`, whose natural keys, `(habit_id, date)` and `key`, are the primary key.
- Column names are snake_case, and the JSON API uses exactly the same names, so there's one naming scheme end to end.
- **Calendar dates** are stored as `TEXT 'YYYY-MM-DD'` and mean the local date in the dashboard's time zone, which is `TZ` in `.env` (§11). **Times of day** are `'HH:MM'`. **Timestamps** are UTC ISO-8601.
- Deletes are real deletes. Things you might want back, such as a completed task, a finished goal or a retired habit, get a `done_at` or `archived_at` column instead.
- Tables are generic, not per feature: one `countdowns` table covers finals and breaks.
- **`source`** (on tasks, countdowns and applications) names where an item came from, such as `gmail:<message id>`. It's unique: creating a second item with the same source returns the first one instead (§5.5).

| Table | Columns | Notes |
|---|---|---|
| `tasks` | `name`, `done_at`, `due?`, `priority`, `notes?`, `link?`, `source?`, `area_id?`, `minutes?`, `repeat?`, `last_done_at?` | One list for to-dos and deadlines: a task with a `due` date is a deadline, and overdue ones stay until done. `priority` is when you mean to do it: `now`, `soon` (the default) or `someday`. `area_id` is one of the `areas`; the API adds its name as `area`. `minutes` is an estimate. `repeat` is a recurrence rule, `{ every, unit: day \| week \| month \| year, weekdays?, day_of_month? }` as JSON, and needs a `due` date: completing the task moves `due` to the next occurrence after today (and after the current due date) and sets `last_done_at`, instead of setting `done_at`. Everything but the name is optional, and Claude fills it in (§5.5, [BLOCKS.md §3](BLOCKS.md#3-tasks-and-assignments)). |
| `areas` | `name`, `position` | The task areas, a list the owner edits on `/manage`; Claude only chooses from it. Names are unique ignoring case. Seeded with School, Work, Job search, Home, Health, Personal and Errands. Deleting one clears it from its tasks; the change record keeps their ids, so Undo puts it back on them. |
| `countdowns` | `label`, `target_date`, `target_time?`, `detail`, `pinned`, `source?` | One-off dates such as finals or a break. Birthdays come from Google Calendar (§4). `target_time` is a local HH:MM; without one, a countdown counts to the start of its day. `detail` is `days` (the default), `hours` or `live`; the last two need a time. A countdown is past from the day after its `target_date`, worked out on every read ([BLOCKS.md §4](BLOCKS.md#4-countdown)). |
| `goals` | `name`, `current`, `target`, `unit?`, `archived_at` | No time frames in v1. |
| `habits` | `name`, `position`, `per_week`, `archived_at` | `per_week` is the weekly target, 1 to 7, defaulting to 7 (daily) ([BLOCKS.md §2](BLOCKS.md#2-habits-a-weekly-target)). |
| `habit_checks` | `habit_id`, `date` | Primary key is `(habit_id, date)`. A row exists means the habit was done that day. Deleting a habit deletes its checks. |
| `applications` | `company`, `role`, `status`, `applied_on`, `url?`, `notes?`, `source?` | `status` is one of `applied`, `interview`, `offer`, `rejected`. |
| `changes` | `at`, `actor`, `resource`, `item_id`, `action`, `before?`, `after?` | Every write, from anyone, in the same transaction as the write itself (§5.5). `action` is `create`, `update` or `delete`; `before` and `after` are the whole row as JSON. Kept for good, for a year in review ([BLOCKS.md §7](BLOCKS.md#7-the-change-record-kept-for-good)). |
| `settings` | `key`, `value` (JSON) | Keys you can change: `night_start` (default `"22:00"`), `night_end` (default `"06:30"`), and `week_start` (`"sunday"`, the default, or `"monday"`), the day weeks start on for habits. Keys the system sets: `night_early_until` (§6.4) and `kiosk_location`, `{ lat, lon, name, reported_at }` (§10, Dock). |

**Not in the database:**
- **Events and birthdays** come from Google Calendar (§4). There's no events table.
- The word list is static reference content and ships as `src/data/words.json`.
- Weather is fetched live (§10, Dock).
- Secrets live in `.env`. Code constants that aren't meant to be changed from the UI (the pending delay, idle timeouts) live in `src/config.js`.

---

## 4. API

It's REST under `/api`, and bodies are validated with the zod schemas in `shared/schemas.js`.

Every stored resource gets the same four routes:

```
GET    /api/<resource>          list (query filters below)
POST   /api/<resource>          create; returns the row
PATCH  /api/<resource>/:id      partial update; returns the row
DELETE /api/<resource>/:id      204
```

The resources are `tasks`, `countdowns`, `goals`, `habits` and `applications`.

**Filters and actions:**

| Route | Purpose |
|---|---|
| `GET /api/tasks?done=false` | Hide completed tasks. Each task carries its area's name as `area`. An unknown `area_id` is refused with the list of areas. |
| `GET` / `POST /api/areas`, `PATCH` / `DELETE /api/areas/:id` | The task areas, in order. Adding a name that exists, ignoring case, returns that area. `PATCH` with `position` moves an area to that place and renumbers the rest. Read-only for claude.ai chats. |
| `POST /api/<resource>` with a `source` that already exists | Returns the existing item with `200` instead of creating a duplicate (§5.5). |
| `GET /api/changes?limit&actor&resource` | The change record, newest first (§5.5). |
| `POST /api/changes/:id/undo` | Puts the item back as it was before that change. The undo is itself recorded. |
| `GET /api/status` | The health of the parts that run on their own: the last nightly backup and the calendar feeds (§5.5), and later the agent's runs. |
| `GET /api/countdowns?past=true` | The current countdowns, nearest first (by date, then time). `past=true` lists the past ones instead. A new date (and time) that has already passed is refused with a 400 saying so, such as *"That date has passed (Jan 1, 2026). Did you mean 2027?"*. Renaming a past countdown is allowed. |
| `GET /api/habits?days=7` | Each habit includes its checked dates in that window, `week_count` (days done this calendar week, from `week_start`) and its streak. The server computes these on every read, so the widget and the agent agree. |
| `PUT` / `DELETE /api/habits/:id/checks/:date` | Mark a day done or not done. Both are idempotent. |
| `POST /api/goals/:id/increment` `{by = 1}` | Add progress to a goal. `by` may be negative, to undo a mistaken tap. |
| `POST /api/applications/:id/advance` | Move an application forward: applied → interview → offer. |
| `GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD` | Read-only. Event occurrences from Google Calendar, classes tagged `routine` (see below). |
| `GET /api/birthdays?from&to` | Read-only. Birthday occurrences from Google Calendar (see below). |
| `GET /api/settings` / `PATCH /api/settings` | Read and change user settings. |
| `GET /api/night` | `{ active, until, start, end }`: whether night mode is in force now, from the night hours and any early start (§6.4). |
| `POST /api/night/start` / `POST /api/night/cancel` | Start night mode early, or cancel an early start (§6.4). |
| `GET /api/weather?lat&lon` | Current weather and today's high and low: `{ location: { lat, lon, name, source }, temperature, condition, high, low }`. `source` is `device`, `kiosk` or `default` (§10, Dock). |
| `PUT /api/location/kiosk` | The kiosk reports its location. Accepted only with the kiosk token. |
| `GET /api/today` | A snapshot of today: today's events, open tasks (with those due within 14 days, or overdue, listed separately), goals, each habit's status today and count this week, the nearest countdowns, application counts, and the weather at the kiosk. This is mainly for the agent. |
| `GET /api/export` | A full JSON dump of every table. |
| `POST /api/login` `{ token }` | Checks a token and sets the login cookie (see Access). |
| `GET /api/health` | `200` with no body. Needs no token and reveals nothing; the kiosk uses it to check the server is reachable before loading or reloading. |

**On every response:**
- **`X-Build: <git commit>`.** The page compares it with its own build to notice a deploy (§6.4).
- **An `ETag` on GET responses.** A repeat poll with nothing changed gets an empty `304`. This keeps polling far inside the free tier's outbound-data allowance (§11).

**Errors:** Every error returns `{ "error": { "message": "...", "details": [...] } }`. A missing or wrong token is 401, a validation failure is 400, and a missing id is 404. The client checks `response.ok`, because `fetch` only rejects on network failure; a 404 or 500 still counts as a successful fetch.

### Access from anywhere

The dashboard must be reachable from the kiosk, the phone and the laptop, from anywhere, and every request must carry a token.

**There are two locks.** Tailscale decides who can reach the server at all. The token decides who can read or change the data, among whatever does reach it. With either one alone, a single mistake would expose everything: a firewall slip, a forgotten device on the tailnet, or opening the MCP endpoint to claude.ai later.

**Network: Tailscale.** The VM, the Pi, the phone and the laptop join one private Tailscale network. `tailscale serve` on the VM gives the dashboard an HTTPS address (`https://dashboard.<tailnet>.ts.net:8443`) that only your own devices can reach. It's on port 8443 because claude.ai's connector needs 443 (phase 8).
- The VM's firewall allows no inbound connections at all. Tailscale connects outward, and SSH goes through Tailscale SSH.
- **Why not a public URL** (a Cloudflare tunnel or an open port): with Tailscale the server is never visible on the internet, so a leaked or guessed token alone isn't enough to get in.
- **The one exception (phase 8):** claude.ai has to reach remote MCP endpoints, so Tailscale Funnel exposes a separate listener, on port 443, that serves only those endpoints and their sign-in. claude.ai only connects to port 443. The dashboard and `/api`, on port 8443, stay tailnet-only. Approving a sign-in still happens on the tailnet (§5.3).

**Tokens:** two long random tokens in `.env`: `API_TOKEN` for you (browsers and Claude) and `KIOSK_TOKEN` for the Pi.
- Both give full access. They're separate so the server can tell the kiosk apart, for its location reports, and so a lost or stolen Pi can be locked out by changing only its token.
- Every `/api` request must present one, reads included, because the data is personal. The only exceptions are `/api/health` and `/api/login`.
- The built frontend files (HTML, JS, CSS, fonts) are served without a token, since they contain no data.

**The login flow** is how a browser gets a token without it ever being in the frontend code:

| Client | How it sends the token |
|---|---|
| Phone or laptop browser (`/manage`, dashboard) | Any `/api` request without a valid cookie gets 401, and the page shows the login screen. You paste `API_TOKEN` once. `POST /api/login` checks it and sets an `HttpOnly`, `Secure`, `SameSite=Strict` cookie that lasts a year. Page scripts can't read it. |
| Kiosk | The autostart opens `https://dashboard.<tailnet>.ts.net:8443/login?token=…` with `KIOSK_TOKEN`, read from a file on the Pi that only the kiosk user can read. The server sets the same kind of cookie and redirects to `/`, which removes the token from the address bar. This repeats every boot, so there's nothing to type on the touchscreen. |
| MCP server | `Authorization: Bearer <API_TOKEN>`, from the MCP server's own config on the laptop. |
| Night-mode script on the Pi | `Authorization: Bearer <KIOSK_TOKEN>`. |

- The cookie holds the token itself, so changing a token logs out every device that used it.
- **No exception for requests from `localhost`.** `tailscale serve` forwards every outside request to `localhost`, so every request would look local and the check would let everyone through.
- Tokens are compared in constant time.
- **Failed logins are rate-limited globally,** not per address, because behind `tailscale serve` every request has the same address. After 10 failures in 15 minutes, all logins are refused for 15 minutes.
- **Changing a token:** edit `.env` and restart. Every device that used it then logs in again.

### Google Calendar

- **Source:** the calendar's **"Secret address in iCal format"** from Google Calendar settings, stored in `GCAL_ICS_URL` in `.env`. There's no Google Cloud project for this and no OAuth.
- **Classes, a second calendar** ([BLOCKS.md §1](BLOCKS.md#1-upcoming-replacing-the-calendar)): optional, in `GCAL_ROUTINE_ICS_URL`. Its events are merged into `/api/events` tagged `routine: true` (the main calendar's are `routine: false`). They're on the Today timeline and in Claude's answers, where planning puts time blocks around them, but not on Upcoming, which they'd fill every day. It's kept apart by calendar, not by recurrence, because tutoring repeats too and has to show. Birthdays come from the main calendar only. Each feed has its own cache and its own warning in the status line (§5.5).
- **Why not the Calendar API:** It needs OAuth, and an OAuth app left in "testing" mode has its login token expire every 7 days. The dashboard only needs to read, which the iCal feed covers.
- **Refresh:** `server/calendar.js` fetches each feed every 10 minutes. The last good copy is saved in `data/calendar-cache/`, so a failed fetch, or a restart while Google can't be reached, still serves events.
- **Birthdays:** birthdays are added to the same Google Calendar as **all-day events that repeat every year** (Google's "Annually" option). The server treats every such event as a birthday. It returns them from `/api/birthdays` and leaves them out of `/api/events`, so the timeline doesn't show them as regular events. Birthdays are separated by that repeat pattern, not by the word "birthday" in the title, so any title works. A yearly all-day event that isn't a birthday, such as an anniversary, is treated the same way, which is fine for a countdown.
- **Occurrences:** The server expands repeating events so the dashboard and the agent always agree. Expansion honors skipped dates (EXDATE) and single changed occurrences (RECURRENCE-ID).
- **Event shape:** `{ id, title, start, end, all_day, location?, calendar, routine }`. The `id` is the event's UID plus its start time, so each occurrence of a repeating event has its own id.
- **All-day events** have a date but no time and no timezone; treat them as local dates.
- **Writing events:** in Google Calendar itself, or by Claude through its Google Calendar connector. Changes reach the dashboard on the next refresh.

---

## 5. Claude agent access

A Claude agent (in Claude Desktop or Claude Code) reads and writes dashboard data through an **MCP server** in `mcp/`. That's all v1 needs; there's no assistant built into the dashboard (an assistant widget is on the Later list).

- It uses the stdio transport and is a thin client over the REST API at `DASHBOARD_URL` (the Tailscale HTTPS address). It sends `DASHBOARD_TOKEN` (the `API_TOKEN`) as a bearer token. The MCP server runs on the laptop where Claude runs, from anywhere, and the data still lives in the one database on the VM. It works whether or not the Pi is on. There's no second copy of the business logic.
- Tool input schemas are the same zod schemas the API validates with, so an agent's input goes through the same validation as the dashboard's.
- Tool descriptions state the date conventions: local `YYYY-MM-DD` dates and `HH:MM` times.
- **Claude Code runs in WSL on the laptop,** so the MCP server does too, and WSL has to reach the tailnet: either run Tailscale inside WSL, or use WSL's mirrored networking with Tailscale on Windows. Checked in phase 4.

**Tools:**

| Kind | Tools |
|---|---|
| Read | `get_today` (includes the weather), `list_tasks`, `list_areas`, `list_events` (from/to, read-only), `list_birthdays` (read-only), `list_countdowns`, `list_goals`, `list_habits`, `list_applications`, `get_settings` |
| Create / edit | `add_*` and `update_*` for tasks, countdowns, goals, habits and applications; `update_settings`. `add_task` asks Claude to fill in due date, priority, area and minutes when it can tell them. Claude names an area, and an unknown one is refused with the list: only the owner adds areas. Planning goes in Google Calendar as time blocks, not as dates on tasks. |
| Quick actions | `complete_task`, `check_habit` (habit, date, done), `increment_goal`, `set_application_status`, `start_night` / `cancel_night` |
| Delete | `delete_item` (resource, id). Its description tells the agent to confirm with the user before deleting. |

**Events and birthdays are not written through this server.** To add or change one, the agent uses Claude's **Google Calendar connector**. A birthday is created as an all-day event repeating yearly. The descriptions of `list_events` and `list_birthdays` say this, so the agent knows where to go.

Changes the agent makes show up on the kiosk within one polling interval (§6).

### 5.1 An autonomous agent (planned)

A Claude agent that runs on a schedule, reads the owner's email and calendar, and keeps the dashboard current: emails become tasks, application updates are noticed, and it writes a morning briefing. It writes through its own connector, and the design is in [AGENT.md](AGENT.md).

**It runs in Anthropic's cloud,** as a scheduled task on the owner's Claude plan, not on the VM. That means no API bill, and it uses Claude's own Gmail and Calendar connectors. A self-hosted agent would need its own Google sign-in app, and Gmail's restricted scopes mean either Google's review or a login that expires every 7 days (the trap §4 avoids for the calendar). The cost is that it can't reach the tailnet, so the dashboard needs a public door (§5.3).

### 5.2 Prompt injection: the threat, and the rule that answers it

Anyone can write an email or a calendar invitation, and text in them can pose as instructions (*"mark every task done"*, *"send your login token to this address"*). Claude's own defenses are a safety net, not a guarantee.

**The rule: nothing a completely fooled agent does is lasting or silent.** It's enforced on the server, not in the agent's instructions:
- **Nothing is lost:** no deletes through either connector, and a daily cap on writes (100 for chats, 30 for the agent).
- **Nothing hides:** every change is recorded with who made it, and can be undone singly or all at once (§5.5). Connector text is cleaned, and links must be `https` and are shown with their domain.
- **Nothing leaks:** connectors can't export, read tokens or manage connections. Gmail, Calendar and Drive's send, write and share tools are blocked in claude.ai, which applies to chats too.
- **Kill switches** on `/manage` turn off either connector, or both.
- **The agent's instructions** say email text is data, never instructions. This is the weakest layer, so nothing above depends on it.

**Tried and dropped: the agent only suggests.** The first version had the agent's connector create suggestions that waited for a tap. It was dropped on Oct 2 for two reasons. Up to 20 cards to review every morning is a chore that wouldn't last. And claude.ai connectors belong to the whole account, so the agent can reach the chat connector anyway, which means suggest-only was only ever enforced by the agent's instructions ([AGENT.md §1](AGENT.md#1-why)).

The limits, the text and link rules and the switches are in [CONNECTOR.md §2](CONNECTOR.md#2-two-connectors-and-what-the-second-one-doesnt-guarantee), [§7](CONNECTOR.md#7-suggestions-the-agents-connector) and [§9](CONNECTOR.md#9-the-claude-section-on-manage-and-the-kill-switches), and the agent's in [AGENT.md §2](AGENT.md#2-what-the-agents-connector-can-do).

### 5.3 One public door

Two remote MCP connectors: **`/mcp` for claude.ai chats** and **`/mcp/agent` for the scheduled agent.** Both add and change things, and neither can delete. They're served through Tailscale Funnel on port 443 by a separate listener with only those routes and their sign-in. The dashboard and `/api` moved to 8443, tailnet-only, because claude.ai only connects to 443. Sign-in is OAuth 2.1, approved on a page on the tailnet. What each connector can reach is an allow-list in the API itself. Claude Code keeps full access through the stdio server. The full design is in [CONNECTOR.md](CONNECTOR.md) §3–4.

### 5.4 Credentials

| Credential | Used by | Can |
|---|---|---|
| `API_TOKEN` | Browsers, Claude Code and Claude Desktop | Everything |
| `KIOSK_TOKEN` | The Pi | Everything a tap can do, plus reporting its location |
| Chat connector (`/mcp`) | claude.ai chats | Its allow-list ([CONNECTOR.md §5](CONNECTOR.md#5-what-each-credential-can-do)). Recorded as `claude`. |
| Agent connector (`/mcp/agent`) | The scheduled agent | Its allow-list ([AGENT.md §2](AGENT.md#2-what-the-agents-connector-can-do)). Recorded as `agent`. |

Each can be revoked on its own: the tokens by changing them in `.env`, and each connector sign-in, a *connection*, from `/manage`.

### 5.5 Records that make an agent trustworthy

- **The change record** (`changes`, §3): every write, from anyone, with the actor (`owner`, `kiosk`, `claude`, `agent`), the time, and the row before and after. Writes through the stdio MCP server are recorded as `claude`. It's kept for good. `/manage`'s **History** lists recent changes, filterable by who made them, each with **Undo**.
- **Sources and no duplicates.** An item created from an email carries `source` (`gmail:<message id>`), and the server never creates a second item with the same source, so an agent re-reading the inbox every morning can't pile up copies.
- **Richer tasks** (§3): due date, priority, area, time estimate, notes and a link back to the email, filled in by Claude.
- **A status line** (`GET /api/status`): the last nightly backup and the calendar feed now, and the agent's runs later. The dock shows a warning only when something is wrong, such as no successful backup in 36 hours, or a calendar feed (main or classes) failing for over an hour.
- **Claude's changes** on `/manage`: only what Claude did, each with Undo, plus *Undo everything since…*, and a ✦ on items Claude created ([CONNECTOR.md §6](CONNECTOR.md#6-claudes-changes-the-log-and-undo)). The agent's new changes also show as a chip in the dock ([AGENT.md §3](AGENT.md#3-the-review-a-glance-not-a-gate)).
- **Later:** the agent's run reports and its daily briefing, shown on the dashboard.

---

## 6. Frontend architecture

**Widgets own their data.** A widget calls `useResource('tasks')` itself and gets back `{ data, loading, error, stale, create, update, remove, refresh }`. `App` only arranges the layout. This settles the conflict between the two earlier docs: widgets fetch their own data, as DESIGN2 wanted, and they do it through one reusable hook per data kind, as DESIGN.md wanted. Widgets never call `fetch` directly; all HTTP goes through `src/lib/api.js`.

**Derived display values are computed in the widget.** `daysUntil(target_date)` lives in the countdown widget, and the deadline labels in the deadlines widget. A parent that derived these would need to know why it was doing so, and the values would go stale overnight. Streaks are the exception: the server computes them (§4), because the agent needs them too, and the widget displays them.

**Time comes from `useNow(intervalMs)`.** The dock ticks every 1 second. Every other widget uses 60 seconds, so date-based values roll over within a minute of midnight.

**Freshness:**
- Data can change from `/manage`, from the agent, from Google Calendar, or from another screen, so `useResource` refetches every 30 seconds and whenever the window regains focus. That's enough for one user. Server-sent events can replace polling later if needed.
- Polls are cheap, because unchanged data comes back as an empty `304` (§4).
- **A poll never undoes a tap.** A poll response to a request sent before the widget's most recent change is ignored, so it can't overwrite an optimistic update with older data.

**Every data-backed widget has four states: loading, error, empty and data.** Loading must be a separate state from empty. An empty array can't tell "still fetching" apart from "genuinely nothing", and showing "No tasks" while loading would be wrong. See §6.4 for what happens when a refetch fails.

**Where state lives:** At the lowest level that covers everyone who needs it. Which widget is focused (a later feature, §12) belongs to `Dashboard`. Task data belongs to `TasksWidget`. There's no Context or Redux unless prop-passing actually becomes painful.

### 6.1 Touch interaction

The kiosk is a touchscreen, and it's used standing at a wall.

**Tap targets:**
- Every tap target is at least **`--hit`** in both directions: 48 reference pixels, which is 48 px on the 1920×1080 reference screen and scales with the screen (§9). A tap target is then the same fraction of the screen at any resolution: about 18 mm on a 32" screen, or 13 mm on a 24" one.
- It's sized from the page, not the tile, so tap targets don't shrink when click-to-focus shrinks a tile.
- The visible mark (a dot, a pill, a checkbox) can stay small. Its tap area is enlarged with padding or an invisible `::after` overlay.

| Widget | Tap target |
|---|---|
| Tasks | The whole row |
| Deadlines | The whole row |
| Habits | Each day cell: at least `0.92 × --hit` wide (the tile is too narrow for seven full-width cells) and the full row height. Habit names truncate to make room. |
| Goals | The **+1** button, `--hit` |
| Job | The status pill, with its tap area enlarged to `--hit` |
| Any editable widget | The ✎ button, `--hit` |

**No hover on touch:**
- ✎ is always visible, at about 60% opacity.
- Tap feedback uses `:active` (a brief brighten), never `:hover`. On touchscreens a hover style sticks after the tap.

**Page-wide touch settings:**
- `touch-action: manipulation`, which removes the double-tap zoom delay.
- `user-select: none` everywhere except text inputs.
- `-webkit-tap-highlight-color: transparent`.
- Long-press context menus are suppressed.

### 6.2 Pending actions

Any tap that **completes or removes** something doesn't happen right away. Instead:

1. The item goes into a **pending** state for **5 seconds**: shown crossed out, with a thin line shrinking underneath as a timer.
2. Tapping it again during those 5 seconds cancels it.
3. When the time runs out, the request is sent and the item leaves the view.

This covers completing a **task**, completing a **deadline**, and advancing a **job application**. It lives in one hook, `usePendingAction`, and the delay is set in `src/config.js`.

A cleared task is marked done (`done_at` is set), not deleted, so it can still be restored in the editor.

**Why the request is sent at the end, not the start:** Cancelling then needs no second request, and the agent and `/manage` never see an item that flickers done and back. The cost is that a page reload during the 5 seconds drops the action, which is acceptable.

**Toggles stay instant:**
- **Habit dots** are sent immediately; a mistaken tap is undone by tapping again.
- **Goal +1** is sent immediately. For 5 seconds afterward a small "undo" appears next to the goal, which sends −1.

Instant actions are **optimistic**: the UI updates immediately, and if the request fails the change is reverted and the widget shows a short error.

### 6.3 Editing and typing

- **Adding a task:** the Tasks widget has an inline **"+ Add task"** row at the bottom. Tasks are the most common thing to add, so they skip the modal.
- **Everything else:** ✎ opens a **shared modal** containing that resource's editor: a list with add, edit and delete. It's a modal rather than an inline form because tiles are too small for forms.
- **On `/manage`:** every editor is stacked on one page as a single column that works on a phone. The last section is **Settings** (night hours, for now).
- **Shared editors:** the editors in `src/editors/` are written once and rendered in both places.
- **Timeline** has no ✎ button. Events are edited in Google Calendar.

**On-screen keyboard:** The kiosk uses the system keyboard, **squeekboard**, which Raspberry Pi OS ships. It pops up when a text field is focused.
- The editor modal sits in the **top half** of the screen so the keyboard, which opens from the bottom, doesn't cover it.
- Inputs set `enterkeyhint` and `inputmode` so the keyboard shows the right layout and action key.
- Dates use the browser's own date picker, which works by touch.

### 6.4 Kiosk behavior

**When the server can't be reached** (the VM is down, or the home internet is):
- Widgets keep showing their last good data rather than switching to an error.
- The dock shows "offline since HH:MM".
- A tile shows its error state only if it has never loaded at all.

**Loading and reloading.** The page can only load while the server is reachable, so nothing ever reloads it blindly:
- **At boot,** the autostart waits until `/api/health` answers before opening Chromium (§11.2).
- **After a deploy,** the `X-Build` header on API responses stops matching the page's own build. The page then reloads at the next moment nobody is using it (5 minutes without a touch), so a new API and an old frontend don't run together for long.
- **Nightly,** at about 04:00, the page reloads to clear any slow memory leaks, but only after `/api/health` answers. It never swaps a working page for an error page while offline. A reload during night hours comes back with the screen already dark.

**Night mode:**

- **Hours:** `night_start` and `night_end` in the `settings` table. The default is **22:00–06:30**. They can be changed on `/manage` (Settings, beside `week_start`) or by Claude. A start later than the end means the period wraps past midnight.
- **During night hours:**
  1. After 5 minutes with no touch, the page puts up a full-screen black overlay.
  2. About a minute later, the system (`swayidle`) turns the display off.
  3. A touch wakes the display. That first tap lands on the overlay and **only dismisses it**, so a tap in the dark can't tick a task by accident.
  4. After another 5 minutes without a touch, it goes dark again.
- **Starting early:** a **moon button** (`--hit`) in the dock starts night mode now. The screen goes dark right away, then behaves as it does during night hours until the next `night_end`.
  - It's stored as `night_early_until` (the next `night_end`), so it survives the nightly reload and is shared with `/manage` and Claude.
  - `/manage` and Claude can also start it or cancel it (`POST /api/night/start` / `cancel`).
  - Tapping the dark screen after an early start wakes it for 5 minutes like any other night touch. The early start stays in force until morning; cancel it from `/manage`, or tap the moon button again while the screen is awake.
- **Outside night hours**, the screen never turns off.
- **Who decides:** the server is the single judge of whether it's night, from the settings plus the early start, through `GET /api/night` → `{ active, until, start, end }`.
  - The page asks it, and puts up the overlay after 5 idle minutes when `active` is true.
  - `swayidle` on the Pi runs `kiosk/display-off-if-night.sh` after 6 idle minutes. That script asks the same endpoint and turns the display off only when `active` is true. Otherwise idle time during the day would switch the screen off too.
  - **If the script can't reach the server,** it judges from the `start` and `end` of its last successful answer, which it saves on the Pi. An internet outage then doesn't keep the screen lit all night.
  - A touch always turns the display back on (`swayidle`'s resume command), day or night.

---

## 7. Layout

The page is a CSS grid with two rows: the **dashboard grid** (`minmax(0, 1fr)`) and the **dock** below it (`--dock-h`, §9). The dashboard grid has **11 columns × 5 rows** and fills its row.

**The layout works on any landscape screen,** because the screen hasn't been chosen:
- **Reference screen: 1920×1080.** Every "≈ px" value in this doc is at that size, and all of them scale with the screen (§9). There, cells are nearly square, about 150 × 152 px, with a 162 px dock.
- **Other aspect ratios:** the cells stretch rather than the page letterboxing. On a 16:10 or 4:3 screen they're taller than they are wide; on 21:9, wider than tall. Content sizes itself from the shorter side of a cell (§9), so it fits either way.
- **Supported:** landscape from 4:3 to 21:9, from 1024×768 up to 3840×2160. CI checks every resolution listed in §13. Portrait isn't supported (§1, Non-goals).

```
"upcoming upcoming upcoming  upcoming  job   job   job   job   goals goals goals"
"upcoming upcoming upcoming  upcoming  job   job   job   job   goals goals goals"
"timeline timeline deadlines deadlines tasks tasks tasks tasks habit habit habit"
"timeline timeline deadlines deadlines tasks tasks tasks tasks habit habit habit"
"timeline timeline wotd      countdown tasks tasks tasks tasks habit habit habit"
```

- **Placement comes from outside.** `App` gives `WidgetShell` an `area` prop, and widgets know nothing about the grid. A component shouldn't encode facts about the world outside itself.
- **`src/layout.js` is the single source of truth for area extents,** e.g. `{ tasks: { col: [5, 8], row: [3, 5] } }`. `WidgetShell` reads its column and row spans from there (for sizing, §9), and click-to-focus (later, §12) will generate its track lists from the same data.
- **Visual priority is set in tiers, not categories:**
  - Constantly needed: tasks, goals, timeline.
  - Occasional: upcoming days, job tracker.
  - Ambient: countdown, word of the day, weather.

  A sidebar and a uniform tile field were both rejected; a sidebar solves a navigation problem that a wall kiosk doesn't have.

---

## 8. Visual design

A **dark, low-contrast night photo** as the background, with near-white text. An earlier bright photo had a blown-out sun that no CSS filter could recover. For v1 the background and accent color are fixed: no swapping, and no accent derived from the photo.

### Widget shell (settled)

```css
.widget-shell, .dock {
  border: 1px solid hsla(0, 0%, 70%, 0.3);
  backdrop-filter: blur(calc(15 * var(--px)));
  background-color: hsla(0, 0%, 50%, 0.1);
  box-shadow: inset 0 0 calc(20 * var(--px)) hsla(0, 0%, 80%, 0.4);
  padding: calc(5 * var(--px));
  border-radius: var(--radius);   /* see §9 */
  overflow: hidden;
}
```

These are the values that were tuned at 1080p, written in reference pixels (`--px`, §9), so the panel looks the same at any resolution. The border stays a true 1 px hairline.

The panel is very low opacity with **no hue**, so the photo shows through almost unfiltered. Separation comes from the heavy blur and from the **inset white glow**. That glow is what made panels readable from across the room, and it's also what separates neighboring panels whose fills are nearly identical. Understand this before changing any value.

**Tried and rejected:**
- **Darkening the fill without a tint.** It looks like a dull gray placeholder. If this is revisited, keep the hue and saturation and lower only the lightness.
- **Windows 11–style dark slate panels.** Near-opaque, flat, with color only from accents. A coherent design, but the current approach was tested at viewing distance and works. Don't convert without a reason.
- **The old light-background styling** (a gradient fill with white text-shadow). Removed. Text sits flat on the panel.
- **SVG-masked gradual blur.** Only needed for blur that ramps across an element. Uniform blur needs nothing extra.

### Color tokens (`src/styles/tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--text` | `white` | Body text |
| `--text-muted` | `hsla(0,0%,100%,.6)` | Labels, secondary text |
| `--hairline` | `hsla(0,0%,100%,.15)` | Dividers between list rows |
| `--track` | `hsla(0,0%,100%,.12)` | Progress-bar track, pending-action timer |
| `--accent` / `--accent-glow` | `hsl(195,90%,70%)` / 30% alpha | Today, the current item, progress, completed |
| `--urgent` | `hsl(0,85%,72%)` | Deadlines due within 2 days, or overdue |
| `--applied` / `--interview` / `--offer` / `--rejected` | blue / amber / green / gray | Job stages |

### Widget titles

A widget gets a title only if the content would be ambiguous without it. Titles are small, uppercase, muted and top-left, and never compete with the data.

- **Titled:** Tasks, Goals, Habits, Deadlines, Job search, Today (the timeline), Upcoming.
- **Untitled:** countdown, word of the day, dock.

A title hides when its tile gets too small. That's a container query, not a media query.

### Glanceable items

These are sized to read from across the room:

| Item | Size |
|---|---|
| Dock clock | About 40% of the dock's height, weight 300. The seconds are small and muted (§10, Dock). |
| Countdown number | Fills its tile |
| Timeline: the current event | One step larger than the other events |

Everything else stays at body size and is read up close.

### Typography

- **Inter** for everything. It was chosen over IBM Plex Sans, Source Sans 3, Public Sans and Manrope for legibility on screen and for its closeness to the Windows 11 reference.
- The word-of-the-day characters use **Noto Sans SC**. Inter has no CJK glyphs, and without an explicit font the characters fall back to whatever the OS provides, with uncontrolled metrics.
- **Fonts are self-hosted** through `@fontsource/inter` and `@fontsource/noto-sans-sc`, bundled by Vite, and imported once in `src/styles/fonts.css`. The Google Fonts `<link>` in `index.html` is removed.
  - **Why:** The kiosk may boot before the network is up, and self-hosting also serves the ten-year goal.
  - Noto's fontsource package is split by Unicode range, so only the chunks for characters actually shown get loaded.
  - Fonts use `font-display: swap`, so text shows in a fallback font immediately rather than staying invisible while fonts load.
- **Weights:** 300 (clock and display numbers), 400, 600 (titles, emphasis), 700 (the now marker in Tasks). Only these are imported.
- **Fallback stacks.** These only show while fonts load, or if a font file somehow fails. They're chosen to cover each device that opens the app:

  ```css
  --font-sans: "Inter", system-ui, "Segoe UI", Roboto, "Noto Sans", "DejaVu Sans", Arial, sans-serif;
  --font-cjk:  "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
  ```

  | Font | Covers |
  |---|---|
  | `system-ui` | Any modern OS's own UI font |
  | `Segoe UI` / `Microsoft YaHei` | Windows laptop |
  | `PingFang SC` | Mac or iPhone |
  | `Roboto` | Android phone viewing `/manage` |
  | `Noto Sans`, `DejaVu Sans`, `Noto Sans CJK SC` | Raspberry Pi OS |

  `--font-sans` is set once on `body`, and `--font-cjk` on the hanzi element, which also carries `lang="zh-Hans"`.
- **Large glyphs get `line-height: 1`** (countdown number, hanzi, dock clock). CJK characters fill nearly the whole em square, so an inherited line-height above 1 adds padding to an already tall box. If a large glyph takes more vertical space than expected, check `line-height` before touching `font-size`.

---

## 9. Sizing

**Nothing is sized in `px` or `vw`, except 1 px borders and the definition of `--px` itself.** The screen's size and resolution aren't known, and the kiosk has to look the same on any of them. Two units cover everything:
- **`--px`** for the page's own pieces: gaps, corners, panel chrome, the dock and tap targets.
- **`--cell`** for content inside widgets.

### Reference pixels: `--px`

`--px` is one pixel of the 1920×1080 reference screen, scaled to the actual screen:

```css
:root { --px: min(100vw / 1920, 100dvh / 1080); }
```

- It uses the smaller of the two ratios, so on a wide screen the height sets the scale and on a squarer one the width does. Page pieces stay in proportion either way.
- It depends only on the viewport, never on a tile, so these pieces don't change when click-to-focus resizes tiles. That's the point: every tile keeps the same corners and gaps, and tap targets never shrink.

| Token | Value | ≈ at reference | Use |
|---|---|---|---|
| `--gap` | `calc(24 * var(--px))` | 24 px | Grid gap, and the gap above the dock |
| `--radius` | `calc(28 * var(--px))` | 28 px | Every tile's corners |
| `--dock-h` | `calc(162 * var(--px))` | 162 px | Dock height |
| `--hit` | `calc(48 * var(--px))` | 48 px | Minimum tap target (§6.1) |
| Page inset | `calc(20 * var(--px))` | 20 px | Body padding around everything |

The dock's content is also sized in `--px`, since the dock only changes size with the screen.

### Content: `--cell`

**Content inside widgets scales with the widget, not the page.** Click-to-focus (later, §12) shrinks sibling tiles without changing the viewport. Anything sized from the page would stay the same size while its tile shrank around it.

Body text should also be the **same size in every widget** at rest. Plain `cqw` doesn't give that, because a 4-column tile's `1cqw` is about twice a 2-column tile's. So each shell works out the size of **one grid cell**, measured through itself:

```css
/* WidgetShell sets style={{ gridArea: area, '--cols': colSpan, '--rows': rowSpan }} from layout.js */
.widget-shell {
  container-type: size;
  --inset: calc(2 * (5 * var(--px) + 1px));   /* the shell's padding and border, both sides */
  --cell-w: calc((100cqw + var(--inset) + var(--gap)) / var(--cols) - var(--gap));
  --cell-h: calc((100cqh + var(--inset) + var(--gap)) / var(--rows) - var(--gap));
  --cell: min(var(--cell-w), var(--cell-h));
}
```

- **Why the correction:** a tile `n` columns wide is `n` cells plus `n − 1` gaps, and the shell's padding and border take space inside that. Dividing `100cqw` by the span alone, as the first version of this doc did, made text about 20% larger in 4-column tiles than in 1-column ones. Undoing both gives exactly one cell, so at rest `--cell` is identical in every widget and text sizes match everywhere.
- **During focus,** it grows and shrinks with the tile.
- **The shorter side of a cell** is used, so content fits on any aspect ratio (§7).
- **How it works:** unregistered custom properties are substituted where they're used. The `cqw` and `cqh` resolve at the descendant that uses them, against the nearest container, which is the shell. **Widgets must not create nested containers**, or `--cell` would measure the wrong box.
- **The shell is a `size` container,** not just `inline-size`, so that `cqh` works. That's safe because the shell's size comes entirely from its grid track, never from its content.

### Type and spacing scale

At the reference screen, a cell is about 150 px:

| Token | Value | ≈ at reference | Use |
|---|---|---|---|
| `--fs-title` | `calc(var(--cell) * 0.09)` | 13 px | Widget title |
| `--fs-small` | `calc(var(--cell) * 0.095)` | 14 px | Dates, counts, pills |
| `--fs-body` | `calc(var(--cell) * 0.12)` | 18 px | Body text |
| `--fs-stat` | `calc(var(--cell) * 0.23)` | 34 px | Job stage counts |
| `--pad` | `calc(var(--cell) * 0.077)` | 11 px | Widget padding |
| `--row-gap` | `calc(var(--cell) * 0.06)` | 9 px | Space between list rows |

**Hero glyphs** size in plain `cqmin` against their own tile: the countdown number and the hanzi. For these, filling the tile *is* the point, and `cqmin` keeps them inside it on any aspect ratio.

### Why these choices

- **Why the radius is relative:** A fixed `15px` turned small tiles into ellipses. `border-radius: 20%` was rejected because percentages resolve separately on each axis and distort non-square tiles.
- **This also fixes a known bug.** `border-radius: 1.5cqw` on `.widget-shell` itself was silently measuring the viewport: a container can't query itself, so `cq*` units in its own rules skip to the next container up.
- **Zooming doesn't enlarge anything.** Everything follows the viewport, which is what the kiosk needs; pinch-zoom is disabled there anyway. On a laptop, resize the window instead.

---

## 10. Widgets

v1 has the nine widgets already in the grid plus the dock.

**Quick action** means a single tap on the dashboard (§6.1–6.2). Everything else happens in the editor, opened with ✎ or on `/manage`.

### Upcoming (4×2) — titled "Upcoming"
Replaced the month calendar, which repeated the dock's date and other tiles' deadlines and birthdays ([BLOCKS.md §1](BLOCKS.md#1-upcoming-replacing-the-calendar)).

- **Shows:** the 4 days after today, starting tomorrow (Today covers today). The 4 is a constant, not a setting.
- **Four day boxes side by side,** full height, each about one grid cell wide: they reach the tile's inner edge and are spaced by the grid's gap, so they line up with the tiles below. CI checks they're within 8 reference px of their columns.
  - Header: the short weekday, with the date below it.
  - All-day events and birthdays: chips at the top. An all-day event shows on each of its days.
  - Timed events: the start time, and the title clamped to 2 lines, both at `--fs-small`. A timed event shows on the day it starts, so one still going from today is Today's.
  - **Overflow:** when a day's events don't fit, the last ones fold into "+N".
- **Empty days are dimmed boxes,** not collapsed, so the row shows time as it passes.
- **Only events and birthdays,** without classes (the `routine` calendar, §4). Tasks are in their own tiles, and countdowns in Countdown.
- **Source:** Google Calendar (§4), read-only. No tap actions and no ✎, like Today.

### Job search (4×2)
> **Redesign planned:** a list of what's next with a notes panel, an OA stage, and no stage counts ([BLOCKS.md §6](BLOCKS.md#6-job-search)).

- **Shows:** a count for each of the four stages, and the 3 most **recently updated** applications, each with a status pill.
- **Quick action:** tapping the pill advances the application (applied → interview → offer), through the 5-second pending action. **Rejected is set only in the editor or by the agent,** so a stray tap can't reject an application.

### Goals (3×2)
> **Redesign planned:** deadlines with pace, a step size, milestones and dreams ([BLOCKS.md §5](BLOCKS.md#5-goals)).

- **Shows:** each active goal with name, `current / target unit`, and a progress bar. Up to 4 fit; anything beyond shows as "+N more".
- **Quick action:** a **+1** button (`--hit`) on each goal, sent immediately, with a 5-second "undo".
- **Finished goals:** the bar is full and a ✓ appears. The goal stays until it's archived in the editor.

### Habits (3×3)
- **Shows:** one row per habit, with dots for the last 7 days (today on the right, its weekday label in accent) and the current streak.
- **Weekly targets** ([BLOCKS.md §2](BLOCKS.md#2-habits-a-weekly-target)): a habit is meant for `per_week` days a week, 7 (daily) by default. Weeks are calendar weeks starting on the `week_start` setting.
  - A thin line between two day columns marks where the week starts. There's none when the week starts on the leftmost day.
  - A habit under 7 a week also shows "2/3 this week" under its name, in accent once met.
- **Quick action:** tap any of the 7 day cells to toggle that day, so a forgotten day can be filled in. Each cell is a full-height tap target (§6.1).
- **Streak:** computed by the server (§4) from the stored check dates on every read, so changing `week_start` or `per_week` loses nothing.
  - At 7 a week: consecutive done days ending today, or ending yesterday if today isn't done yet. That way the streak doesn't read 0 every morning. Shown as "4-day streak".
  - Below 7: calendar weeks in a row that met the target, ending with this week if it's already met and with last week otherwise, so it doesn't drop to 0 at the start of every week. Shown as "3-week streak".
- **Logging stays manual:** a tap on the kiosk, `/manage`, or telling Claude (`check_habit`).

### Timeline (2×3) — titled "Today"
- **Source:** Google Calendar (§4), read-only. No ✎ button.
- **Shows:** today's events on a vertical line, each with time, title and optional location. Past events are dimmed; the current one is highlighted in accent and set one step larger.
- **All-day events** appear as small chips at the top, above the line. So does a birthday on the day itself.
- **Current event:** the one whose start ≤ now < end.
- **Overflow:** if the events don't fit, the earliest past events collapse into "N earlier" at the top.
- **Empty state:** "Nothing scheduled today."

### Due soon (2×2)
> **Redesign planned:** becomes Assignments, the school area's tasks with a due date ([BLOCKS.md §3](BLOCKS.md#3-tasks-and-assignments)).

- **Shows:** open tasks that are overdue or due within 14 days, by due date, labeled "overdue", "today", "tomorrow" or "N days". Those due within 2 days, and overdue ones, turn `--urgent`. The area is shown when set.
- **Quick action:** tapping a row completes the task, through the 5-second pending action.
- It replaced the Deadlines tile when deadlines became tasks with a due date (§17).

### Tasks (4×3)
> **Redesign planned:** the new row, sort and filter on the tile, and Assignments replacing Due soon ([BLOCKS.md §3](BLOCKS.md#3-tasks-and-assignments)). The data is built: areas, now/soon/someday, time estimates and recurrence.

- **Shows:** open tasks that aren't in Due soon, sorted now → soon → someday, then due date, then shortest first, then age, each with a round checkbox. A "!" marks `now` tasks, someday ones are muted, and a chip shows the time estimate ("15m", "1h", "1h+"). Each task appears in exactly one of the two tiles. It's a `<ul>`, not a table: a table is for data where every column means the same thing in every row.
- **Quick action:** tapping a row clears the task, through the 5-second pending action (§6.2). Cleared tasks are still in the database and can be restored in the editor.
- **Adding:** an inline "+ Add task" row at the bottom (§6.3).
- **Markup:** a controlled checkbox (`checked` plus `onChange`) paired with a `<label htmlFor>` that fills the row, so tapping anywhere on the row toggles it.
- **Empty state:** "No tasks! Time to relax!"

### Word of the day (1×1) — untitled
- **Shows:** pinyin on top, the hanzi as the large anchor, and the definition below, centered.
- **Choosing the word:** `wordIndex = daysSinceEpoch(localToday) % words.length`. It's deterministic and needs no storage. It's derived inside the widget.
- **Word list:** `src/data/words.json` with entries `{ hanzi, pinyin, definition }`. It starts from an openly licensed HSK 1–3 vocabulary list, credited in the README as its license requires.
- **Must test:** single-character words and long definitions. The definition clamps to 2 lines.

### Countdown (1×1) — untitled
- **Which countdown:**
  1. A birthday **within the next 7 days**, if there is one. It reads, for example, "3 days · Mom's birthday".
  2. Otherwise, the `pinned` countdown if there is one and it's current. A pinned countdown that has passed no longer counts.
  3. Otherwise, the nearest current countdown, by date and then time.

  Birthdays only take over when they're close. With a year's worth of birthdays, one is almost always nearer than anything else, and they would otherwise crowd out finals and breaks.
- **Current and past** ([BLOCKS.md §4](BLOCKS.md#4-countdown)): a countdown is current through its whole target day, and past from the next. There's no column and no job. The tile and `list_countdowns` show only current ones; the editor has a Past view to review and delete them.
- **Past dates are refused** by the server, which knows the time zone: on a new countdown, or as a new date or time for one. Today is allowed, and a timed countdown is allowed until its time. The message names the date and, when the same date next year is still ahead, asks "Did you mean 2027?". The editor shows it beside the field, and Claude gets the same text.
- **Number,** by `detail`:

  | `detail` | Shows |
  |---|---|
  | `days` (default) | Weeks above 60 days, then days, then "Today" all through the target day. |
  | `hours` | As `days`, then hours under 48 hours and minutes under 1 hour. |
  | `live` | As `hours`, then a ticking clock in the last 24 hours: H:MM large with the seconds small and muted beside it, as on the dock, then M:SS all large in the last hour. In the last minute, the seconds alone fill the tile. The clock fills the tile's width, so it grows as the moment gets closer. |

  `hours` and `live` need a time. Once a timed countdown's time has come, the tile reads "Today" with the label for the rest of that day. With `days`, the time decides when the countdown is refused as passed, and orders two countdowns on the same day; the tile reads "Today" all day either way.
- **Ticking:** every second only during a live countdown's last day, every minute otherwise.
- **Date math:** compare local calendar dates, never raw timestamps (see §14). Hours and minutes count real time to the moment, so a day with a clock change has 23 or 25 hours.

### Dock
- **Left:** a large live clock (1-second tick, `tabular-nums`, §8 glanceable sizes) and the date.
  - **Seconds** sit beside the minutes, at about 40% of the clock's size in `--text-muted`, above AM/PM. Full-size seconds were rejected: changing every second, they would pull the eye across the room, and the clock would be about 40% wider ([BLOCKS.md §8](BLOCKS.md#8-the-dock-clock-seconds)).
- **Right:** the weather: current temperature, condition, and the day's high and low. The page asks the server (`GET /api/weather`) every 30 minutes. The server fetches from Open-Meteo, which needs no API key, and caches each location's answer for 30 minutes.
- **Weather location,** in this order:
  1. **The viewing device's own location,** if its browser gives permission. The page asks once, rounds the coordinates to about 1 km, and sends them with the request. They aren't stored. On a phone or laptop, the weather is for wherever you are.
  2. Otherwise, **the kiosk's location.** At boot and then once a day, the kiosk page looks up its own public IP address's location with a free service that needs no key (for example ipapi.co) and reports it with `PUT /api/location/kiosk`. The server keeps it as the `kiosk_location` setting. It's accurate to the city, which is enough for weather, and it follows the Pi if it moves. Chromium on the Pi has no location service, so the kiosk itself always ends up here.
  3. Otherwise, **Austin, TX** (30.27, −97.74).

  **Why the kiosk reports its location rather than the server looking up its own:** the server is in a Google data center, so its IP address would give the data center's weather. Only the kiosk token may report a location, so a phone on another network can't move the kiosk's weather.

  **Privacy note:** the kiosk sends the home's public IP address to the lookup service once a day. A device's own location goes only to your server and on to Open-Meteo.
- **Moon button:** a button (`--hit`) that starts night mode early (§6.4).
- **Offline:** "offline since HH:MM" appears when the server can't be reached (§6.4).
- Nothing else goes in the dock for v1.

---

## 11. Hosting and kiosk setup

### 11.1 Server: a Google Cloud VM

- **Machine:** one `e2-micro` VM on Google Cloud's always-free tier, in `us-central1` (Iowa), the free-tier region nearest Austin. It runs Debian, on the free 30 GB standard disk. It has 1 GB of memory, so the frontend is never built on it (see Deploy).
- **Cost:** expected $0.
  - The free tier covers the VM, its disk, its public IP address, 5 GB of Cloud Storage in the same region, and 1 GB a month of outbound data.
  - Polling with `304` responses keeps the dashboard well under that data limit (§4).
  - A **billing budget alert at $1** makes any charge visible right away.
- **Node:** Node 24 LTS from NodeSource, matching `.nvmrc`.
- **Server:** Express runs as a systemd service under its own unprivileged user, listens on `127.0.0.1:3000`, and restarts on failure.
- **Time zone:** `TZ` in `.env` (for example `America/Chicago`) sets what "today" means for the server: streaks, night hours, `/api/today`, which deadlines are overdue. It must match the kiosk's time zone. The VM's system clock stays on UTC.
- **Network:** Tailscale, with `tailscale serve` providing HTTPS. The firewall allows no inbound traffic, and SSH is Tailscale SSH (§4, Access).
- **Continuous backup:** Litestream runs as a second systemd service and replicates to a Cloud Storage bucket in the same region, keeping 30 days. It signs in as the VM's service account, which can reach that one bucket and nothing else.
- **Nightly backup:** a systemd timer at 03:00 makes the snapshot and the JSON export, and rclone copies them to Google Drive (§2, Data durability). rclone uses Drive's `drive.file` scope, so it can only see files it created itself, not the rest of your Drive.
- **Deploy:** `vm/deploy.sh`, run from the laptop:
  1. It refuses a commit that isn't on `main` or whose CI didn't pass (checked with `gh`).
  2. It builds the frontend on the laptop.
  3. Over Tailscale SSH, it takes a snapshot of the database, checks out that commit on the VM, copies the built `dist/`, runs `npm ci --omit=dev`, and restarts the service. Migrations run at startup. The snapshot lets a bad migration be rolled back.

  The kiosk picks up the new frontend on its own (§6.4).

### 11.2 Kiosk: the Pi

- **Hardware:** Raspberry Pi 5 and a wall-mounted touchscreen. The screen's size and resolution are still open; the layout handles any landscape screen (§7).
- **What it runs:** no server and no data. Just Chromium, Tailscale, `swayidle` and the night-mode script. It can be switched off at any time without affecting anything else.
- **OS:** Raspberry Pi OS (Wayland, with the labwc compositor), which ships squeekboard.
- **Network:** Tailscale, to reach the VM.
- **Browser:** Chromium starts from labwc's autostart and restarts if it crashes. Flags:

  ```
  --kiosk --noerrdialogs --disable-pinch --overscroll-history-navigation=0
  --ozone-platform=wayland --enable-wayland-ime
  ```

  The last two let squeekboard pop up for text fields.
- **Startup:** the autostart waits until `/api/health` answers, then opens `/login?token=<KIOSK_TOKEN>` so the kiosk gets its cookie on every boot (§4, Access).
- **Night mode:** `swayidle` runs `display-off-if-night.sh` after idle, which turns the display off only when the server says it's night, or when the saved schedule says so if the server can't be reached. A touch turns the display back on (§6.4).
- **Time zone:** the Pi's time zone must match `TZ` on the server. The page works out "today" from the Pi's clock.
- The setup files live in `kiosk/`.

---

## 12. Build plan

The rule is **one complete vertical slice before any breadth**: a few real widgets on a real database is a portfolio project, and nine shells on mock data isn't. Each phase ends with something working and with CI green.

**How work reaches `main`:** Claude works on a branch per phase, or smaller, opens a pull request, and fixes it until CI passes. Luke reviews and merges. Claude never merges and never pushes to `main` (§13).

| Phase | Deliverable |
|---|---|
| **0. Groundwork** | With Luke's go-ahead, commit the current work. Create the public GitHub repo, the CI workflow and the `main` ruleset (§13). Add Vitest and Playwright. Restructure into the layout in §2. Add `layout.js` and the `--px` / `--cell` sizing, and convert every `vw` value, with the layout checks passing at every resolution in §13. Fix the radius. Self-host the fonts. Build the live dock clock. **Load it on the Pi 5** (from `vite preview` on the laptop) to check that the blur on ten panels runs smoothly. |
| **1. First slice** | Express, SQLite and migrations, both tokens and the login flow, then `tasks` end to end: schema → API → `useResource` → a working `TasksWidget` with pending clear, tested at every layer. Delete the mock array. |
| **2. All widgets live** | The remaining tables, routes and widgets; Google Calendar reading for the timeline and birthdays; weather on the server with the location order; the word list; settings; seed data. |
| **3. Cloud server and backups** | Everything in §11.1: the VM, Tailscale, Litestream, the nightly Drive copy, the deploy script, and a test restore. This comes before agent access because that's when real data starts going in, and real data must be backed up from the first day. |
| **4. Agent access** | The MCP server and `/api/today`. This comes before the editing UI because it's small once the API exists, and it immediately gives a way to bulk-enter real data. |
| **5. Touch and editing** | The touch rules (§6.1), pending actions for deadlines and jobs, the inline add row, shared editors, the `/manage` page, and the dashboard modal with ✎ buttons. |
| **6. Kiosk** | Everything in §11.2: Chromium flags and startup, kiosk login, squeekboard, night mode with the moon button, and the reload rules (§6.4). |
| **7. Agent-ready data** | Deadlines merged into tasks, with priority, effort, area, notes, link and source; the Due soon and Tasks tiles; the change record with History and Undo; sources and no duplicates; the status line. (§5.5) |
| **8. The public door** | Three PRs ([CONNECTOR.md §14](CONNECTOR.md#14-how-its-built-three-pull-requests-one-after-another)): the credential allow-lists, OAuth with approval on the tailnet, the public listener and the chat connector, Claude's changes with Undo everything since; then go-live on Funnel port 443, with the dashboard moved to 8443; then the agent's connector, which writes, and the chip listing its changes ([AGENT.md §6](AGENT.md#6-phase-8s-last-pr-rescoped)). (§5.2–5.4) |
| **9. The agent** | Its standing instructions and schedule, with its Gmail and Calendar connectors read-only; run reports in the status line; the daily briefing. (§5.1, [AGENT.md §5](AGENT.md#5-what-phase-9-keeps)) |
| **Block redesign** | Nine PRs in three rounds, in the order in [BLOCKS.md §10](BLOCKS.md#10-build-order). First: dock seconds; the change record kept for good; weekly habit targets; countdown times; the task data. Then: Upcoming; the Tasks and Assignments tiles; goals. Last: job search. They can go before or alongside phase 9. |
| **Later** | Click-to-focus with container-query condensing; a daily background photo from Unsplash (below); an assistant widget on the dashboard; sunrise gradient; an idle photo-album mode; a wins log; a stats or "wrapped" page for a year in review. (Recurring tasks are now designed, in [BLOCKS.md §3](BLOCKS.md#3-tasks-and-assignments).) |

### Later: a daily background photo from Unsplash

The owner's idea: a new background each day, through the Unsplash API. Until then the bundled photo stays, and it remains the fallback afterwards.

- **Only dark photos.** A random photo will often be bright, and a bright photo is what broke readability before (§8). The photos come from an Unsplash collection of dark night photos that the owner curates, and the API picks one from it at random.
- **The server picks the day's photo,** once each morning, and remembers it, so every screen shows the same one. That's about one API call a day, far inside the free limit. The access key lives in `.env`.
- **Unsplash's API rules:** the page loads the image from Unsplash's own URL, not a saved copy. Each use is reported to Unsplash's download endpoint. The photographer and Unsplash are credited on screen, as a small line in a corner of the dock.
- **Offline:** an image loaded from Unsplash can't load without internet, so the bundled photo shows instead.
- The bundled photo is from Unsplash too. Its license allows keeping it in the repo, and the photographer is credited in the README.

### Later, already designed: click-to-focus

- **Tapping a widget's title** makes it grow while its siblings shrink and condense. Tapping the title again, or another widget's title, changes focus.
  - Titles are the trigger because taps inside a tile already do things (tick a task, toggle a habit).
  - The untitled widgets (countdown, word of the day) have no tap actions, so tapping **anywhere** on them focuses them.
  - Titles become tap targets at least `--hit` tall.
- The focused-widget state lives on `Dashboard`.
- Growth comes from **interpolating `grid-template-columns` and `grid-template-rows`** between two `fr` lists that have the same number of tracks. Those animate smoothly; `grid-template-areas` and `span` do not.
- The track lists are generated in JavaScript from `layout.js`, not hand-written as eleven CSS rules.
- Each widget handles its own condensing through container queries; the grid doesn't do it for them.

---

## 13. Testing and CI

**Tests are written with the code, in the same pull request, not afterward.** Every bug fix comes with a test that fails without the fix.

### What gets tested

| Layer | Tools | What |
|---|---|---|
| Database | Vitest, `better-sqlite3` in memory | Each test gets a fresh `:memory:` database with every migration applied. Migrations run from zero, `user_version` matches the number of migrations, and running them twice changes nothing. Constraints hold: foreign keys are on, `status` rejects unknown values, a habit can't be checked twice on one date, and deleting a habit deletes its checks. Every query function, including empty tables, archived rows and done rows. |
| API | Vitest, the app from `server/app.js` on a random port, plain `fetch` | Every route: 401 with no token, a wrong token, and each valid token; the kiosk-only route rejects `API_TOKEN`; login rate limiting. The 400 error shape for invalid bodies, 404 for missing ids. Create → read → update → delete round trips. Idempotent habit checks; goal increments, including negative ones; `advance` never reaching `rejected`. `ETag` and `304`; `X-Build`; `/api/export` containing every table. Google Calendar and Open-Meteo are replaced by fixtures, so tests never touch the network. |
| Logic | Vitest | Local-date parsing, including the UTC trap and days when the clocks change; night hours across midnight, and the early start; streaks; which countdown is shown; deadline labels; the word index; the weather location order. iCal expansion from fixture `.ics` files: skipped dates, changed occurrences, all-day events, yearly all-day events as birthdays, and an event that crosses a clock change. |
| Hooks and widgets | Vitest, jsdom, Testing Library | `useResource`'s four states, refetch on focus, ignoring stale polls. `usePendingAction` firing after 5 seconds and cancelling on a second tap, with fake timers. Each widget's loading, error, empty and data states. |
| Layout | Playwright (Chromium), against a production build with the API mocked from fixtures | At each supported resolution: no page scroll; no widget's content overflowing its tile; every tap target at least `--hit` in both directions; body text the same computed size in every widget; long names truncating rather than wrapping. Screenshots of every resolution are saved with each run for review. |

**Resolutions checked:** 1024×768 (4:3), 1280×720, 1366×768, 1920×1080, 1920×1200 (16:10), 2560×1080 (21:9), 2560×1440 and 3840×2160.

**Coverage:** measured with V8's built-in coverage. CI fails below 90% of lines or 85% of branches in `server/`, `shared/`, `src/lib/` and `src/hooks/`. Widgets are covered by their state tests and the layout checks rather than by a percentage.

### CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

| Job | What it does |
|---|---|
| `check` | `npm ci`, which fails if the lockfile is out of date → lint with `--max-warnings 0` → tests with the coverage thresholds → `npm run build` → `npm audit --omit=dev --audit-level=high` → the secret check |
| `layout` | The Playwright layout checks at every resolution; uploads the screenshots |
| `dependency-review` | Pull requests only. Fails if the PR adds a dependency with a high-severity advisory, or one whose license isn't compatible with MIT. |

**The secret check** fails if a `.env` file is tracked, or if a Google private iCal address (`/private-<hex>/basic.ics`) appears anywhere in the repo or in `dist/`. GitHub's secret scanning and push protection are also turned on. They catch common token formats, but not this project's own tokens.

**Hardening the workflow:**
- The workflow has `permissions: contents: read`, so no job can write to the repo.
- It uses no secrets and no `pull_request_target`, so a pull request can't reach anything sensitive.
- Third-party actions are pinned to full commit SHAs, not tags. Dependabot updates them and the npm packages weekly, grouped into one PR each.
- Node comes from `.nvmrc`. Each job has a 10-minute timeout, and a new push cancels the previous run on the same branch.

**Ruleset on `main`:**
- Changes arrive only through pull requests. No direct pushes, force pushes or deletion.
- All three jobs must pass, on a branch that's up to date with `main`.
- Linear history, through rebase merges. (Squash merges would turn each merged PR of a stack into a conflict for the next one.)
- No bypass, including for the repo owner.
- **No required approvals.** The only account is Luke's, and Claude acts through it with `gh`, so GitHub can't tell the two apart. The review rule is a working agreement instead: **Claude opens pull requests and gets them green; only Luke merges.**

**How Claude uses it:** push the branch, open the pull request, run `gh pr checks --watch`, read failures with `gh run view --log-failed`, fix them, and repeat. A pull request goes to Luke only once it's green.

---

## 14. Implementation gotchas

Each of these caused a real bug or near-miss, or is a known trap. Keep them in mind.

- **The height chain:**
  - `html`, `body`, `#root` and `.page` all need `height: 100%`. `#root` is the easy one to miss.
  - Use `100%` on `.page`, not `100vh`, which ignores body padding and overshoots.
  - Use body `padding` with `box-sizing: border-box` for the edge inset, not `margin`.
- **Grid and flex minimum sizes:**
  - Use `minmax(0, 1fr)`, never a bare `1fr`, which is `minmax(auto, 1fr)` and lets content inflate a track.
  - Use `min-width: 0` / `min-height: 0` on flex and grid children that contain truncating text.
- **Sizing units:** no `px` or `vw` except 1 px borders and the definition of `--px`. Page pieces use `--px`; content inside widgets uses `--cell` (§9).
- **Container queries don't apply to the element itself.** `cq*` units in a container's own rules resolve against the next container up.
- **`container-type: size`** ignores a box's content when working out its size. It's right for the shells, whose size comes from grid tracks, and wrong for anything that should grow with its content.
- **Parsing dates:** `new Date("2026-10-02")` parses as **UTC** midnight, which is the previous day in US time zones. Parse `YYYY-MM-DD` into a local date (`new Date(y, m - 1, d)`) in `shared/dates.js`, and use those helpers everywhere. Day differences compare local midnights.
- **Time zones on the server:** the server's "today" comes from `TZ`, not from the VM's clock, which is on UTC. Never make a date with `toISOString().slice(0, 10)`, which gives the UTC date.
- **iCal feeds:**
  - All-day events have no time or timezone; treat their dates as local.
  - Repeating events must honor skipped dates (EXDATE) and single changed occurrences (RECURRENCE-ID), or cancelled classes will still show.
- **Touch:** `:hover` styles stick after a tap on touchscreens, so they must never be the only feedback.
- **Night hours wrap past midnight:** 22:00–06:30 means `now >= start || now < end`, not `start <= now < end`. The early-start end time is the *next* 06:30, which may be tomorrow.
- **Behind `tailscale serve`, every request comes from `localhost`.** Never skip the token check based on where a request comes from, and don't rate-limit per address.
- **Polls versus taps:** a poll sent before a local change can arrive after it. Drop responses older than the last change, or an optimistic update flickers back.
- **SQLite and sync folders:** never put the live database in Drive, Dropbox or OneDrive; it gets corrupted. Copies are made only with Litestream and `VACUUM INTO`.
- **React state:** replace arrays and objects, never mutate them. Use the updater form (`setX(prev => …)`) whenever the new value depends on the old. Filtered views are computed at render time, not stored in state.
- **Effects:**
  - An effect callback can't be `async`; declare an async function inside it and call it.
  - Anything that leaves something running (an interval, a listener, a poll, a pending-action timer) returns a cleanup function.
  - Use one effect per concern.
- **`fetch`:** check `response.ok` (see §4).

---

## 15. Decision log

| Date | Decision |
|---|---|
| 2026-09 | 11 × 5 named-area grid and a dock below it |
| 2026-09 | Frosted glass shell: low opacity, no hue, heavy blur, inset glow. Dark night background, Inter font. |
| 2026-09 | Plain CSS with custom-property tokens. No Tailwind for now; it was an AI's call originally, not the owner's. |
| 2026-09 | SQLite for structured data; markdown files only for real prose. Generic tables over per-feature ones. |
| 2026-09 | No plugin system, no custom kanban, no home-built rich-text editor |
| 2026-09-30 | Claude writes the code; Luke owns the design and reviews |
| 2026-09-30 | Backend: Express + `better-sqlite3`, one process that also serves the frontend |
| 2026-09-30 | ~~Widget sizing uses `cqw` through a per-column `--col` unit~~ Replaced by `--cell` below. Click-to-focus deferred to later. |
| 2026-09-30 | v1 widget set is the current nine. Birthdays are yearly countdowns. No merged date panel; no wins log in v1. |
| 2026-09-30 | Data entry on the kiosk (quick actions, inline add, editor modal) and on `/manage`, from shared editor components |
| 2026-09-30 | Claude agent access via an MCP server that wraps the REST API with the same zod schemas. That's enough for now; an assistant widget may come later. |
| 2026-09-30 | Widgets fetch their own data through a `useResource` hook; poll every 30 seconds and on window focus |
| 2026-09-30 | Kiosk is a wall-mounted touchscreen; its size and resolution aren't chosen yet |
| 2026-09-30 | Tap targets at least `--hit` (48 reference px); no hover-only UI |
| 2026-09-30 | Completing a task, completing a deadline and advancing an application wait 5 seconds (tap again to cancel) before they're sent |
| 2026-09-30 | Fonts self-hosted through fontsource, with fallback stacks for Windows, Mac, Android and Pi; Noto Sans SC for hanzi |
| 2026-09-30 | Events come only from Google Calendar, read through its private iCal feed. No local events table. Claude writes events through its Google Calendar connector. |
| 2026-09-30 | System on-screen keyboard (squeekboard) for typing at the kiosk |
| 2026-09-30 | Night mode: display off after idle during night hours; the waking tap only dismisses the overlay |
| 2026-09-30 | Offline: keep showing last good data with an indicator in the dock; reload only when the server answers |
| 2026-09-30 | ~~Short screens: shrink and center the grid~~ Replaced by the any-screen layout below. |
| 2026-09-30 | Hardware: Raspberry Pi 5 |
| 2026-09-30 | One Google Calendar. Birthdays are yearly all-day events in it; the countdown shows one when it's within 7 days. The `repeats_yearly` column is dropped. |
| 2026-09-30 | ~~Weather location: `.env` override, then the Pi's IP-based location, then Austin~~ Replaced below. |
| 2026-09-30 | Access from anywhere through Tailscale, with a token on every request (login cookie for browsers, bearer token for MCP) |
| 2026-09-30 | Night hours are settings, default 22:00–06:30, changeable on `/manage` or by Claude. A moon button starts night mode early. |
| 2026-09-30 | Click-to-focus is triggered by tapping a widget's title (or anywhere on an untitled widget) |
| 2026-09-30 | Server and database on a Google Cloud free-tier VM; the Pi is a screen only. Drive, OneDrive and Dropbox rejected for the live database. |
| 2026-09-30 | Backups: Litestream to Cloud Storage (continuous, 30 days) plus a nightly snapshot and JSON export to Google Drive. No USB. |
| 2026-09-30 | Works on any landscape screen from 4:3 to 21:9. No `px` or `vw` except borders; `--px` for page pieces, `--cell` for content. |
| 2026-09-30 | The server fetches the weather. Location: the viewing device's own, then the kiosk's reported IP location, then Austin. |
| 2026-09-30 | Keep the token and login flow on top of Tailscale, with a separate kiosk token |
| 2026-09-30 | Tests are written with the code: Vitest for the database, API, logic and hooks; Playwright layout checks at 8 resolutions |
| 2026-09-30 | Public GitHub repo, MIT license. CI with read-only permissions and pinned actions; `main` changes only through green pull requests, merged by Luke. |
| 2026-09-30 | Node 24 LTS, pinned in `.nvmrc` |
| 2026-10-01 | A daily background photo from an owner-curated Unsplash collection goes on the Later list. The bundled photo stays for v1. |
| 2026-10-01 | `main` takes rebase merges only (not squash), so stacked PRs update cleanly after each merge |
| 2026-10-01 | An autonomous Claude agent is planned, running in Anthropic's cloud on the owner's plan (no API bill; Claude's own Gmail and Calendar connectors) |
| 2026-10-01 | Prompt injection: ~~the agent only ever suggests~~ (superseded Oct 2: it writes through its own connector, [AGENT.md](AGENT.md)); the server enforces its limits; everything is recorded and undoable; its Gmail and Calendar access is read-only (§5.2) |
| 2026-10-01 | Deadlines become tasks with a due date. Tasks gain optional priority, effort, area, notes, link and source, filled in by Claude. |
| 2026-10-01 | Every write is recorded with its actor, and can be undone from `/manage` |
| 2026-10-01 | No command palette: everything is already on the screen |
| 2026-10-01 | Two claude.ai connectors: chats add and change directly (no deleting), the agent suggests (superseded Oct 2: the agent writes too, capped at 30 a day, [AGENT.md](AGENT.md)). Because connectors are account-wide, the agent can reach both; the owner accepts that, with Claude's changes and Undo everything since as the safety net. |
| 2026-10-01 | The public door is Funnel on port 8443 to a separate listener with only the MCP and sign-in routes. Sign-ins are approved on the tailnet. |
| 2026-10-01 | The public door moves to port 443 and the dashboard to tailnet-only 8443: claude.ai only connects to port 443. |
| 2026-10-01 | Links from connectors must be `https` and are shown with their domain. Text from connectors is cleaned of characters that disguise it. |
| 2026-10-01 | One OAuth client per connector; the client, not the `resource` parameter, decides a token's access. Refresh replacements are derived from the old token, so a repeat in the grace window gets the same one. *Undo everything since* defaults to claude.ai only. |
| 2026-10-01 | Public rate limits are split by connection, visitor and kind, so strangers can't use up claude.ai's share or trigger the dashboard's login lockout. A replaced refresh token keeps working until its replacement is used, so a lost reply doesn't look like theft. A lost connection shows in the status line. |
| 2026-10-02 | The block redesign, after using the live dashboard: Upcoming replaces the calendar, weekly habit targets, editable task areas, now/soon/someday, time estimates and recurrence, Assignments replaces Due soon, countdown times and a live clock, goal deadlines, milestones and dreams, a job search list with a notes panel, and the change record kept for good. Every decision and its reasons are in [BLOCKS.md](BLOCKS.md). |

---

## 16. Open questions

None of these block phases 0–1. They get settled by trying things on the real setup.

- [ ] **The screen.** The layout doesn't depend on its size or resolution, but the physical size of tap targets does: about 18 mm on a 32" screen, 13 mm on 24". Anything from about 21" up is fine.
- [ ] **Blur performance on the Pi 5.** Expected to be fine. Phase 0 checks it at 1080p; recheck once the screen is bought, since blur costs more on a 4K panel.
- [ ] **How quickly Google's iCal feed reflects edits.** If changes take too long to show up, switch to the Calendar API with OAuth. Checked in phase 2.
- [ ] **Free-tier data use.** Expected to be far under 1 GB a month. Check the billing report after the first month.
- [ ] **Night hours:** 22:00–06:30 is a starting point, and it can be changed from `/manage` at any time.
- [ ] **Where the daily briefing goes on the grid** (phase 9). Every tile is spoken for; the word of the day's tile or a line in the dock are candidates.
- [ ] **Scheduled agents and connectors** (phase 9): confirm that a scheduled Claude agent can use claude.ai's Gmail, Calendar and custom connectors with their tools limited as §5.2 requires, and whether a task can leave out a connector or web search. More in [CONNECTOR.md §12](CONNECTOR.md#12-open-questions).

---

## 17. What changed from the earlier docs

| Earlier | Now | Why |
|---|---|---|
| Text sized in `vw` (DESIGN.md, latest commit) | `--cell` built on `cqw`/`cqh` | `vw` breaks under click-to-focus, and plain `cqw` makes text sizes differ between widgets |
| localStorage, no backend (DESIGN.md) | Express + SQLite | Data shared by the kiosk, `/manage` and the agent; owning the data |
| `App` owns hooks and passes props (DESIGN.md) | Widgets call `useResource` themselves | DESIGN2's ownership rule, keeping DESIGN.md's one-hook-per-resource idea |
| Fonts from Google Fonts | Self-hosted, with fallback stacks | Offline boot, and one less outside dependency |
| One-week compressed plan (DESIGN2) | Phases 0–6 | Claude is now writing the code; the vertical-slice-first rule stays |
| Merged date panel with birthdays (DESIGN2) | Nine separate widgets; birthdays as yearly countdowns | Owner's choice; the current grid already has nine areas |
| Habit data `days: boolean[7]` | A `habit_checks` table of dates | The old shape only made sense on the day it was written |
| Events entered by hand; `.ics` or Google "later" | Google Calendar only, read-only | Google is where the schedule already lives; no second copy to keep in sync |
| Kiosk side-mounted at seated eye height | Hung on the wall, touchscreen | Owner's hardware plan |
| Hover to reveal ✎ | Always visible | Touchscreens have no hover |
| Birthdays as yearly rows in `countdowns` | Yearly all-day events in Google Calendar | Owner will keep them in Google; one place for dates |
| Home network only, no auth | Tailscale plus a token | Owner needs access from anywhere |
| Night hours fixed in `config.js` | Settings in the database, with an early-start button | Owner wants them changeable |
| `UNASSIGNED` area / empty-panel concerns (DESIGN2) | Closed | The current area string has no gaps, and every panel gets content in phase 2 |
| Server and database on the Pi | On a Google Cloud free-tier VM; the Pi is a screen only | The Pi won't always be on, and `/manage` and Claude need the data at any time |
| Nightly backups on the Pi's own disk | Litestream to Cloud Storage, plus nightly copies in Google Drive | Backups on the same disk die with it; owner doesn't want a USB drive |
| A 32" 1080p screen; layout checked only at 1920×1080 | Any landscape screen; `--px` and `--cell`; CI checks 8 resolutions | The screen isn't chosen yet |
| `--col` = `100cqw / span` | `--cell`, corrected for gaps and shell padding, from the shorter side of a cell | The old formula made 4-column text about 20% larger than 1-column text, and didn't handle other aspect ratios |
| Short screens: dock minimum height, grid shrinks and centers | Cells stretch to fit any aspect ratio | Replaced by the any-screen layout |
| Tap targets 48 px | `--hit`, 48 reference px | The same share of the screen at any resolution |
| Weather fetched by the browser; location from `.env`, then the server's IP | Fetched by the server; location from the viewing device, then the kiosk's IP, then Austin | The server's IP is now a data center; owner's order of preference |
| One token | `API_TOKEN` and `KIOSK_TOKEN` | Identifies the kiosk; a lost Pi can be locked out on its own |
| Kiosk opens `localhost` | Kiosk opens the VM's Tailscale address, after waiting for the server | The server moved off the Pi |
| No testing plan | Tests with every change; CI with a protected `main` | Guardrails for code Claude writes |
| Separate tasks and deadlines | One task list; a due date makes a task a deadline. The Deadlines tile becomes Due soon. | They did the same job, and one list with optional details suits Claude doing the data entry |
| Claude only through Claude Code / Desktop, on the laptop | Planned: a public MCP door with two connectors, direct for claude.ai chats and suggest-only for a scheduled agent | The owner wants an agent that runs on its own and Claude doing data entry from any chat; prompt injection from email is the main risk |
| A fooled agent can't change anything without the owner (§5.2, first version) | Nothing a fooled agent does is lasting or silent | claude.ai connectors are account-wide, so the agent can reach the chat connector; the owner prefers direct adds, with Claude's changes and Undo as the net |
| Deploy by building on the Pi | `vm/deploy.sh` from the laptop; CI must have passed | The 1 GB VM shouldn't build; a failing commit is never deployed |
