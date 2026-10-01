# Implementation decisions

Choices made while building, where [DESIGN.md](DESIGN.md) left room or turned out to be wrong in detail. Newest last within each phase. Anything here that changes the design itself is also reflected in DESIGN.md.

## Phase 0: groundwork

| Choice | Why |
|---|---|
| Widgets are placed with `grid-column` / `grid-row` lines computed from `src/layout.js`, not a `grid-template-areas` string in CSS. | Keeps `layout.js` the single source of truth (DESIGN §7). A CSS area string would be a second copy that could drift. A unit test checks the areas tile the 11 × 5 grid exactly. |
| The `habit` area is now `habits`, and the component `HabitsWidget`. | Matches the other plural widget names (tasks, goals, deadlines). |
| Word of the day: the hanzi is `min(42cqmin, 88cqw / characters)`, pinyin and definition `13cqmin`, pinyin muted. | The old sizes (pinyin 20, hanzi 50, definition 25) overflowed the tile, and a two-character word wrapped onto two lines. The layout check caught it. The widget passes the character count as `--chars` so longer words shrink to stay on one line. |
| The "hide the title when the tile is small" container query is left out for now. | Container queries can't use custom properties, so the threshold would have to be a fixed `px` value, which breaks the any-screen rule. Only click-to-focus (later) makes tiles small enough to need it; it'll use an aspect-ratio query then. |
| The dock clock shows AM/PM at a smaller size beside the time. | Keeps the glanceable digits large without the period crowding them. |
| The 2 px stage-color line on job stage cards is `max(1px, 2 × --px)`. | It's chrome rather than content, so it scales with the page, but never drops below a visible hairline. |
| Background photo resized from 6000 × 3748 (2.7 MB) to 3840 × 2399 (0.8 MB). | Covers a 4K screen; a 6000 px image costs the Pi about 90 MB of memory to decode. |
| The superseded root design drafts moved to `docs/archive/`. | DESIGN.md replaces them, but they record how decisions were reached. |
| `src/exercises.jsx` moved to `src/scratch/` and removed from `.gitignore`. `src/scratch/` is excluded from lint. | It was tracked and ignored at the same time. Scratch code is practice, sometimes deliberately broken, and never imported. |
| Unit tests run with `TZ=America/Chicago`. | Pins the time zone so the date tests cover real clock changes (2026-03-08 and 2026-11-01) on any machine. |
| Test files opt into jsdom with a `// @vitest-environment jsdom` comment; everything else runs in Node. | Simpler than separate Vitest projects, and server tests never get browser globals by accident. |
| Date helpers are `parseDate`, `formatDate`, `today`, `addDays`, `daysBetween` and `isDateString` in `shared/dates.js`. | One set used by the frontend, server and MCP server (DESIGN §14). |
| The layout check treats any element with a `data-tap` attribute as a tap target and checks it's at least `--hit`. | Gives widgets one explicit way to opt their targets into the check. |
| Dependency review blocks copyleft licenses (GPL, AGPL, LGPL, SSPL) instead of allowing a fixed list. | An allow-list fails on harmless licenses nobody listed (font and data licenses especially). The goal is MIT compatibility, and copyleft is what breaks it. |
| The git remote uses HTTPS with `gh` as the credential helper, configured for this repo only. | The laptop's SSH key isn't registered with GitHub. |
| In WSL without `sudo`, Playwright's Chromium gets its missing libraries (`libnspr4`, `libnss3`, `libasound2`) from packages extracted into `~/.cache/playwright-libs`, used through `LD_LIBRARY_PATH`. | Lets the layout checks run locally. CI installs them normally. |

## Phase 1: first slice (tasks)

| Choice | Why |
|---|---|
| Completing a task sends `{ "done_at": "<the client's ISO time>" }`. Restoring sends `null`. | The JSON uses the column names exactly (DESIGN §3), so there's no separate `done: true` action. The server validates it as a UTC timestamp. |
| Each task row is a `<label>` that wraps its checkbox, rather than a checkbox paired with a separate `<label htmlFor>`. | Same result: a tap anywhere on the row toggles it. Wrapping needs no ids and can't get out of step. |
| The inline "+ Add task" row is built now, not in phase 5. | A vertical slice you can't add to isn't usable. The other widgets still get their editors in phase 5. |
| A long task list scrolls inside its tile, with a fade at the bottom edge; the add row stays pinned below it. | The page never scrolls, but a long list has to go somewhere. The fade shows there's more without a "+N more" control. |
| The login rate limit covers login attempts only (`POST /api/login` and the `/login?token=` link), not every API request. The server refuses to start unless both tokens are at least 32 characters and different. | A device with an old token would keep polling with it, and locking every request after 10 failures would lock everyone out. With 32 random characters, guessing through the API isn't feasible anyway. |
| The cookie is named `dashboard_token`. Any 401 response switches the page to the login screen. | One place handles being logged out, whichever widget notices first. |
| `POST` answers `201 Created` with the new row. | Standard for a create. |
| Caching uses Express's built-in weak ETags, plus `Cache-Control: no-cache, private` on `/api`. | `no-cache` makes the browser revalidate every poll, and the ETag turns an unchanged answer into an empty 304, with no ETag code of our own. |
| Tables are SQLite `STRICT`, and task names are limited to 1–200 characters both in zod and in a `CHECK` constraint. | The database guards itself even if a bug skips validation. |
| Changes made through `useResource` resolve to the saved row, or `null` if saving failed. A failed save is kept as `saveError`, separate from a failed load (`error`). | Widgets never need `try`/`catch`. "Couldn't save" and "couldn't load" are different messages. |
| `.env` is read with Node's own `--env-file-if-exists`, not the `dotenv` package. | One fewer dependency (priority 2). |
| A local `.env` with random tokens is generated for development and gitignored. | So the dev server starts straight away. |
| The server serves `dist/` even if it doesn't exist yet at startup. | Lets a build land after the server has started, which the full-stack browser test relies on. |
| Browser tests come in two kinds: layout checks against `vite preview` with a mocked API, and full-stack tests against the real server on an in-memory database (port 4174). | The layout checks need fixed data, such as very long names. The full-stack tests prove the slice works end to end: login, add, clear, and the clear surviving a reload. |
| A shared Vitest setup file unmounts Testing Library renders after each test. | Without test globals, Testing Library doesn't do it on its own, and leftover hooks kept polling across tests. |

## Phase 2: all widgets live

| Choice | Why |
|---|---|
| Every widget's tap action is built now: deadline complete and application advance (both with the 5-second wait), habit day toggles, and goal +1 with undo. Phase 5 is left with the editors, the ✎ modal and `/manage`. | "Fully functional widgets" means the one-tap actions work. Editing details belongs with the shared editors. |
| One generic store and router (`server/crud.js`) serve all six resources. Resources with extra behaviour wrap it: countdown pinning, goal increment, habit checks, application advance. | The rule of three was met several times over: six resources share the same four routes. |
| At most one countdown is pinned. Pinning one unpins the rest, and a partial unique index enforces it. | "The pinned countdown" (DESIGN §10) implies there's only one. |
| Goal amounts are SQLite `REAL`, so 64.5 miles works. They never go below 0. | Not every goal counts whole things. Undoing past 0 would make no sense. |
| A habit can't be checked for a future day (400); unchecking one is allowed. | You can only have done something on a day that has happened. Unchecking is always harmless. |
| The habit streak is computed over all of a habit's checks, not only the 7 days shown. Checking or unchecking returns the habit with its new streak. | A 30-day streak shouldn't show as 7. The widget gets the streak straight back, without waiting for a poll. |
| Applications list most recently updated first, and advancing one bumps it to the top. | That's what "the 3 most recently updated" (DESIGN §10) needs. |
| `applied_on` defaults to today, and `status` to `applied`. | Most applications are logged the day they're sent. |
| Advancing an offer or a rejection answers `409 Conflict`. | It's a valid request for a state that can't move. |
| Habit names may wrap onto two lines, with the streak written under the name ("4-day streak") instead of in its own column. Day cells are `0.92 × --hit` wide and marked `data-tap="narrow"`, which the layout check allows. | With seven touch-sized cells, a single-line name only had room for about seven characters. |
| Goals: the +1 button sits beside the name and bar, spanning both rows. "undo" appears to its left for 5 seconds, and a second +1 restarts the 5 seconds. | Fits four touch-sized goals in the 3 × 2 tile. |
| Deadline rows are whole-row buttons, like task rows. A long deadline list scrolls inside its tile with the same fade as tasks. | Consistent with tasks (DESIGN §6.1: the whole row is the target). |
| The timeline folds the earliest past events into "N earlier" by measuring after each render: one more is folded while the list overflows. It recounts whenever the events or their past/current status change. | The design asks for exactly this, and a pure CSS clip can't tell past events from upcoming ones. |
| The timeline's current event is one step larger (1.25×) and bold. Each event's location is shown under its title. | DESIGN §8 (glanceable) and §10. |
| A birthday counts down as "N days until Mom's birthday", using the event's own title. On the day it reads "Today" plus the title. | Any title works for birthdays (DESIGN §4), so the title is shown as written. |
| Weeks are rounded to the nearest whole week. | "10 weeks until Finals" reads better than "9.6". |
| Calendar dots are small accent dots under the date; on today's filled circle the dot is dark. | Visible on both backgrounds. |
| Temperatures are in Fahrenheit. | The owner lives in Austin. Changing it is one parameter (`temperature_unit`). |
| The weather route always answers, with `report_location: true` when the kiosk should look itself up. That happens when the kiosk is the client and its last report is older than 20 hours. | No extra endpoint, and only the kiosk ever contacts the IP-location service. |
| A device's location is rounded to 2 decimals (about 1 km) before it leaves the browser. Weather is cached per rounded location for 30 minutes, and a failed refresh falls back to the last answer. | Enough precision for weather, less for privacy, and devices nearby share one fetch. |
| "Offline since" is tracked in `src/lib/api.js`: a request that can't reach the server starts it, and any answer, even an error, clears it. | It means the server is unreachable, not that something went wrong on it. |
| An all-day event's `end` is the last day it covers (inclusive), not iCal's exclusive end. A timed event's `start` and `end` are UTC timestamps. A birthday is `{ id, title, date }`. | Simpler for both the widgets and the agent. Only timed events need time zones. |
| The calendar feed is never logged by URL, and errors say only what failed. | The address is a password (DESIGN §2). |
| The word list is HSK 1–3 (595 words), built by `scripts/build-words.js` with a fixed shuffle. A reading is chosen automatically, and 21 words whose automatic pick was a surname, archaic or vulgar reading were set by hand. | The source doesn't mark which reading HSK means. The script makes the list reproducible and the hand-checked words visible. |
| The full-stack browser tests run `e2e/server.js`: the real app with the fixture calendar and fixed weather. The kiosk's location lookup is answered by the test. | Tests never touch the network. |
| Browser tests fix the page's clock at 1:35 PM on 2026-09-30 in America/Chicago. | Screenshots and states (past, current, overdue) are the same on every run. |
| `npm run seed` fills every table with sample data, but only tables that are empty. | Safe to run against a real database by mistake. |
| npm only runs install scripts for approved packages. `better-sqlite3` is approved, pinned to its version. | It needs its script to fetch its compiled binary. Any new package with an install script fails `npm ci` until someone approves it, which is a useful guardrail. |

## Phase 3: cloud server and backups (the parts that don't need the Google Cloud account)

| Choice | Why |
|---|---|
| On the VM, the code is in `/opt/dashboard` and the data in `/var/lib/dashboard`: the database, its calendar cache, and the backups. The server runs as a `dashboard` user that can write only the data directory. | Code and data stay apart, so a deploy can never touch the data. systemd's `ProtectSystem=strict` enforces it. |
| `.env` on the VM sets `DATABASE=/var/lib/dashboard/dashboard.db`, `HOST=127.0.0.1` and `PORT=3000`. `vm/setup.sh` writes it with two new random tokens. | The tokens are generated where they live, and never typed or copied around in plain text. |
| Litestream is pinned to v0.5.17 and keeps 30 days (`snapshot.retention: 720h`). It signs in with the VM's own service account, which can reach only the backup bucket. | Litestream's default is 24 hours. No key file exists anywhere to leak. |
| The nightly backup runs at 03:00 Chicago time through a systemd timer (`Persistent=true`, so a missed night runs at the next boot). It keeps 14 nights on the VM and 30 in Google Drive. Only dated copies go to Drive. | Pre-deploy snapshots are for rolling back a deploy, so they stay on the VM: the last 5. |
| `GET /api/export` downloads as `dashboard-export-YYYY-MM-DD.json`, with every table and the schema version. The nightly backup writes the same export next to each snapshot. | One export format, used both ways. |
| `vm/deploy.sh` deploys the head of `origin/main`. It requires that commit's CI run to be `success`. It builds in a clean worktree on the laptop, snapshots the database, checks the commit out on the VM, swaps `dist/`, restarts, and waits until `/api/health` answers with the new `X-Build`. | Only reviewed, green code reaches the server, and a failed start is reported instead of passing silently. |
| The build ID is the commit SHA: `BUILD` is passed to Vite as `__BUILD__`, and written to `/opt/dashboard/build.env` for the server's `X-Build`. | The page and the server compare the same string (DESIGN §6.4). |
| CI runs `shellcheck` on `vm/*.sh` and `scripts/*.sh`. | The deploy and backup scripts guard the data, so they get linted like everything else. |
| An application's `applied_on` defaults to today on the server, by the server's clock, rather than in the shared schema. | Found on the first day after the build started: the schema's default used the machine's real date, ignoring the clock the server and tests run on. |
