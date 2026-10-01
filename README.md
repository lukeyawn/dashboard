# Dashboard

A personal life dashboard for a wall-mounted Raspberry Pi touchscreen: schedule, deadlines, tasks, habits, goals and the internship search on one glanceable screen. It's built to own its data (one SQLite file) and to stay readable for years (plain JavaScript, plain CSS, few dependencies).

The full design, and the reasons behind it, is in [docs/DESIGN.md](docs/DESIGN.md). Choices made while building it are logged in [docs/DECISIONS.md](docs/DECISIONS.md).

## Status

Being built in phases ([DESIGN §12](docs/DESIGN.md#12-build-plan)). The layout works on any landscape screen, and the tasks widget works end to end: SQLite, the API with token login, and the dashboard. The other widgets still show placeholder data.

## Development

Requires Node 24 (see `.nvmrc`).

```sh
npm ci
cp .env.example .env # then fill in two random tokens (the file says how)
npm run seed         # optional: a few sample tasks
npm run dev:server   # the API on http://localhost:3001
npm run dev          # in a second terminal: the dashboard at http://localhost:5173
npm test             # unit, database and API tests (Vitest)
npm run coverage     # the same, with the coverage thresholds CI enforces
npm run lint
npm run e2e          # layout checks at 8 screen resolutions (Playwright)
```

Log in with the `API_TOKEN` from `.env`.

The first `npm run e2e` needs `npx playwright install chromium`. Screenshots of every resolution land in `test-results/screens/`.

## License

MIT. See [LICENSE](LICENSE).
