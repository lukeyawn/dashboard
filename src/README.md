# src/

The frontend: React 19 and plain CSS, built by Vite. It serves four pages, picked by the address with no router library: the dashboard (`/`), the login screen (`/login`), the editors (`/manage`) and the claude.ai approval page (`/connect/<id>`).

Every `x.test.js(x)` tests the file beside it. Widgets are tested in four states: loading, error, empty and with data.

## Top level

| File | Purpose |
|---|---|
| `main.jsx` | Entry point: loads the fonts and global styles and renders `Root`. |
| `Root.jsx` | Picks the page from the address, and switches to the login screen whenever the server answers 401. |
| `App.jsx` | The dashboard: the grid of widgets, the dock, night mode and the kiosk's reload rules. |
| `layout.js` | The 11 × 5 grid as data: where each widget sits and how many cells it spans. It's the single source of truth for placement and for the `--cell` unit (DESIGN §7, §9). |
| `config.js` | Constants that aren't user settings: the 5-second pending delay, the 30-second poll interval, the 30-second notes autosave, the 5-minute idle time and the kiosk's 04:00 nightly reload. |

## Subdirectories

| Directory | Purpose |
|---|---|
| `components/` | The page's building blocks. `Page` is the full-screen frame with the background. `Dashboard` is the grid. `WidgetShell` places a widget on the grid and gives it the frosted panel. `Dock` holds the clock, date, weather, moon button, offline notice, status warnings and, in the middle, the agent's ✦ with its "*n* new". `Modal` is the editor modal, kept clear of the on-screen keyboard. `EditButton` is the ✎ that opens a widget's editor. `NightOverlay` is the black screen at night. `ClaudeMark` is the ✦ on items Claude created; tapping it shows who added it, with Undo. `Menu` is a button that opens a touch-sized list of choices over the page, such as Tasks' Sort and Filter and Job search's Stage. `OpenLink` opens a stored link in a new tab, asking first when Claude wrote it. |
| `agent/` | The scheduled agent's runs and changes, behind the dock's ✦ (docs/AGENT.md §7). `useAgentChanges.js` reads the last few days of both, and anything older Luke hasn't seen, with the `agent_seen_at` setting, and marks them seen. `timeline.js` groups changes under their run, newest first, and works out what's new, the count, and what becomes seen. `AgentTimeline.jsx` is the popover the ✦ opens, in two tabs: Briefings, each run's briefing with a link to its changes, and Changes, each run's summary and changes with Undo, Undo this run, and Undo all new; both with a line between new and seen. |
| `widgets/` | One folder per widget, each with its component, CSS and test: `assignments` (tasks with a due date in the `assignments_area` setting's area), `countdown`, `goals`, `habits`, `job` (Job search: Needs action, To apply and Waiting on, and a panel with notes to edit), `tasks`, `timeline` (Today), `upcoming` (the next 4 days of events), `wotd` (word of the day). Logic a widget needs that's worth testing alone sits beside it, such as `countdown/countdown.js` (which date to count down to) `assignments/daysLabel.js` ("tomorrow", "3 days", "Thu"), and `tasks/taskView.js` (the Tasks tile's sort and filter, kept in the browser and reset on the kiosk when idle). `habits/habitText.js` words a habit's streak and count this week, for the tile and its editor. `job/jobText.js` words an application's next step ("due Fri", "Interview · Tue, Oct 6, 2:00 PM"), and `job/prepare.js` builds Prepare's claude.ai link, keeping the application's fields in a quoted block. |
| `editors/` | Adding and editing data. `EditorForm` is a form built from a field list and checked with the shared schema, plus an optional `check` for rules that need the clock (a countdown date that has passed). A field's `when` shows it only for some values, such as a goal's target for a progress goal and not a milestone. Its `choice` field is a row of buttons for a few short options, and a `custom` field draws its own input: `taskFields.jsx` has the task's area picker (with "New area…") and its repeat rule. `ResourceEditor` is one resource's add form and item list, with optional filters and sorts (tasks and job applications use them). `editors.jsx` configures it for each resource, including the task areas and Dreams (goals kept off the tile, each with "Make it a goal"). `SettingsEditor` holds the night hours, `week_start` and the Assignments area. The same editors appear in the ✎ modal and on `/manage`. |
| `hooks/` | State and timing. `useResource` fetches, polls and applies optimistic updates. `usePendingAction` is the 5-second tap-again-to-cancel. `useNow` is the ticking clock. `useHiddenCount` works out how many items to fold away so a list fits, for Today's "N earlier", Upcoming's "+N", and "+N more" in Tasks and Assignments, and works it out again when the list changes size or the web fonts finish loading. `useIdle` and `useKiosk` drive kiosk behavior and the reload rules. `useConnection` gives "offline since". `useTimedFlags` handles short-lived flags such as a goal's undo. `useWeather` fetches the weather for this device or the kiosk. |
| `lib/` | Plain helpers. `api.js` is the only place that calls `fetch`; it checks `response.ok` and reports 401s. `format.js` formats numbers and times, and reads a link's domain. `location.js` is the kiosk's daily location report. |
| `login/` | The login screen, where you paste `API_TOKEN` once per browser. |
| `connect/` | The page at `/connect/<id>` where you approve or deny a claude.ai sign-in. It's reached by claude.ai's redirect, on the tailnet. |
| `manage/` | `/manage`: every editor on one page, in a single column that works on a phone, ending with History, the recent changes from anyone, each with Undo. `describeChange.js` puts a change into words ("Completed task …"), says who made it, and lists what Undo everything since couldn't undo, with why. `Claude.jsx` is the Claude section: the connectors' switches and today's counts, the connections with Revoke, and `ClaudeChanges.jsx`, everything Claude did with Undo and Undo everything since. |
| `styles/` | Global CSS. `tokens.css` holds the colors and the `--px`, `--cell` and `--hit` units. `base.css` holds the height chain and resets. `fonts.css` loads the self-hosted fonts. |
| `data/` | `words.json`, the word-of-the-day list, generated by `scripts/build-words.js`. |
| `testing/` | Test support: `setup.js` runs before every test file, and `fakeApi.js` is an in-memory stand-in for the API. |
| `scratch/` | React practice from before Claude wrote the code. It's never imported and is excluded from lint; some of it is deliberately broken. |

The background photo and the favicon live in `public/` at the repo root, which Vite serves as-is.
