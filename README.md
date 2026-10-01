# Dashboard

A personal life dashboard for a wall-mounted Raspberry Pi touchscreen: schedule, deadlines, tasks, habits, goals and the internship search on one glanceable screen. It's built to own its data (one SQLite file) and to stay readable for years (plain JavaScript, plain CSS, few dependencies).

The full design, and the reasons behind it, is in [docs/DESIGN.md](docs/DESIGN.md). Choices made while building it are logged in [docs/DECISIONS.md](docs/DECISIONS.md).

## Status

Being built in phases ([DESIGN §12](docs/DESIGN.md#12-build-plan)). Done: the layout (any landscape screen), the API with token login, SQLite, Google Calendar, weather, all nine widgets with their one-tap actions, backups and the server's setup scripts, an MCP server for Claude ([mcp/README.md](mcp/README.md)), and editors in a ✎ modal on the dashboard and at `/manage` (works on a phone). and the kiosk: night mode, the reload rules, and the Pi's setup ([kiosk/SETUP.md](kiosk/SETUP.md)). What's left needs real hardware and accounts: setting up the server ([vm/SETUP.md](vm/SETUP.md)) and the Pi.

## Development

Requires Node 24 (see `.nvmrc`).

```sh
npm ci
cp .env.example .env # then fill in two random tokens (the file says how)
npm run seed         # optional: sample data in every empty table
npm run dev:server   # the API on http://localhost:3001
npm run dev          # in a second terminal: the dashboard at http://localhost:5173
npm test             # unit, database and API tests (Vitest)
npm run coverage     # the same, with the coverage thresholds CI enforces
npm run lint
npm run e2e          # layout checks at 8 screen resolutions (Playwright)
```

Log in with the `API_TOKEN` from `.env`.

The first `npm run e2e` needs `npx playwright install chromium`. Screenshots of every resolution land in `test-results/screens/`.

## Credits

The background photo is by [Sarthaak Maji](https://unsplash.com/@srtkmaji) on [Unsplash](https://unsplash.com/photos/snow-covered-mountain-under-starry-night-dOA35bihSjk), used under the [Unsplash License](https://unsplash.com/license).

The word-of-the-day list is built from [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (MIT), whose definitions come from [CC-CEDICT](https://cc-cedict.org/) (CC BY-SA 4.0). `src/data/words.json` is shared under CC BY-SA 4.0 accordingly.

## License

MIT for the code; see [LICENSE](LICENSE). The word list is CC BY-SA 4.0 (see Credits).
