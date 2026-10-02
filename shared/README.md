# shared/

Code used by the server, the frontend and the MCP server alike, so all three agree on what data looks like and what a date means.

| File | Purpose |
|---|---|
| `schemas.js` | The zod schemas for every request body and query: what the API validates, what the editors check before sending, and the MCP tools' input schemas. One definition, three uses (DESIGN §4, §5). |
| `dates.js` | Local calendar dates as `YYYY-MM-DD`: `parseDate`, `formatDate`, `today`, `addDays`, `daysBetween`, `isDateString`, and `startOfWeek` for the `week_start` setting. Use these instead of `new Date(string)`, which parses as UTC and lands on the previous day in US time zones (DESIGN §14). |
| `tasks.js` | What "due soon" means (within 14 days, or overdue) and the order tasks are shown in (priority, then due date, then effort), so the tiles, `/api/today` and Claude agree. |
| `dates.test.js` | Runs with `TZ=America/Chicago`, across the 2026 clock changes. |
