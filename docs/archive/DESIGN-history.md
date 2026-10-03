# DESIGN.md §15 and §17, as of Oct 3, 2026 (archived)

> **Archived Oct 3, 2026.** These two sections of [DESIGN.md](../DESIGN.md) recorded how the design got where it is: a dated log of decisions, and what changed from the first drafts ([DESIGN-v1.md](DESIGN-v1.md), [DESIGN-v2.md](DESIGN-v2.md)). They're kept for that history. Decisions since are in [DECISIONS.md](../DECISIONS.md) and the topic docs. Not current: some entries were superseded later.

## Decision log (DESIGN.md §15)

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
| 2026-10-01 | Prompt injection: ~~the agent only ever suggests~~ (superseded Oct 2: it writes through its own connector, [AGENT.md](../AGENT.md)); the server enforces its limits; everything is recorded and undoable; its Gmail and Calendar access is read-only (§5.2) |
| 2026-10-01 | Deadlines become tasks with a due date. Tasks gain optional priority, effort, area, notes, link and source, filled in by Claude. |
| 2026-10-01 | Every write is recorded with its actor, and can be undone from `/manage` |
| 2026-10-01 | No command palette: everything is already on the screen |
| 2026-10-01 | Two claude.ai connectors: chats add and change directly (no deleting), the agent suggests (superseded Oct 2: the agent writes too, capped at 30 a day, [AGENT.md](../AGENT.md)). Because connectors are account-wide, the agent can reach both; the owner accepts that, with Claude's changes and Undo everything since as the safety net. |
| 2026-10-01 | The public door is Funnel on port 8443 to a separate listener with only the MCP and sign-in routes. Sign-ins are approved on the tailnet. |
| 2026-10-01 | The public door moves to port 443 and the dashboard to tailnet-only 8443: claude.ai only connects to port 443. |
| 2026-10-01 | Links from connectors must be `https` and are shown with their domain. Text from connectors is cleaned of characters that disguise it. |
| 2026-10-01 | One OAuth client per connector; the client, not the `resource` parameter, decides a token's access. Refresh replacements are derived from the old token, so a repeat in the grace window gets the same one. *Undo everything since* defaults to claude.ai only. |
| 2026-10-01 | Public rate limits are split by connection, visitor and kind, so strangers can't use up claude.ai's share or trigger the dashboard's login lockout. A replaced refresh token keeps working until its replacement is used, so a lost reply doesn't look like theft. A lost connection shows in the status line. |
| 2026-10-02 | The block redesign, after using the live dashboard: Upcoming replaces the calendar, weekly habit targets, editable task areas, now/soon/someday, time estimates and recurrence, Assignments replaces Due soon, countdown times and a live clock, goal deadlines, milestones and dreams, a job search list with a notes panel, and the change record kept for good. Every decision and its reasons are in [BLOCKS.md](../BLOCKS.md). |

---

## What changed from the earlier docs (DESIGN.md §17)

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
| Claude only through Claude Code / Desktop, on the laptop | A public MCP door with two connectors that add and change things directly but never delete: one for claude.ai chats, and one for a scheduled agent, capped at 30 changes a day | The owner wants an agent that runs on its own and Claude doing data entry from any chat; prompt injection from email is the main risk |
| A fooled agent can't change anything without the owner (§5.2, first version) | Nothing a fooled agent does is lasting or silent | claude.ai connectors are account-wide, so the agent can reach the chat connector; the owner prefers direct adds, with Claude's changes and Undo as the net |
| Deploy by building on the Pi | `vm/deploy.sh` from the laptop; CI must have passed | The 1 GB VM shouldn't build; a failing commit is never deployed |
