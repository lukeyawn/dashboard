# shared/

Code used by the server, the frontend and the MCP server alike, so all three agree on what data looks like and what a date means.

| File | Purpose |
|---|---|
| `schemas.js` | The zod schemas for every request body and query: what the API validates, what the editors check before sending, and the MCP tools' input schemas. One definition, three uses (DESIGN §4, §5). |
| `dates.js` | Local calendar dates as `YYYY-MM-DD`: `parseDate`, `formatDate`, `today`, `addDays`, `daysBetween`, `isDateString`, and `startOfWeek` for the `week_start` setting. Use these instead of `new Date(string)`, which parses as UTC and lands on the previous day in US time zones (DESIGN §14). |
| `countdowns.js` | When a countdown is current or past, the order they're shown in, and the messages that refuse a date that has passed or `hours`/`live` without a time, so the server, the tile and the editor agree (docs/BLOCKS.md §4). |
| `repeat.js` | Recurring tasks: a rule's next occurrence (the first after today and the current due date, so missed ones are skipped) and the rule in words ("every 2 weeks on Mon, Thu"). |
| `applications.js` | The Job search tile's three lists (rejected and withdrawn are archived): Needs action (OAs, offers and anything with a step from today on, by that step), To apply, and Waiting on; and each stage's name ("OA", "To apply"). |
| `goals.js` | A goal's pace toward its deadline (where steady progress would be today, and whether it's more than 10% behind), and the words for the time left ("3 wk left") and the deadline ("Dec 31"). |
| `tasks.js` | Which tasks are assignments (a due date, in the `assignments_area` setting's area) and which go in Tasks, the order each tile shows them in (Tasks: now/soon/someday, then due date, then shortest first; Assignments: soonest first), and the time chip's text ("15m", "1h", "1h+"), so the tiles, `/api/today` and Claude agree. |
| `runs.js` | The agent's runs (docs/AGENT.md §7): `RUN_LABEL`, what a run label may contain, `RUN_OPEN_MS`, how long a run takes writes and its report, and `runState`, whether a run has reported, is still running, or never reported, so the server's refusals and the timeline agree. |
| `dates.test.js` | Runs with `TZ=America/Chicago`, across the 2026 clock changes. |
