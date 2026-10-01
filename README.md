# Dashboard

A personal life dashboard for a wall-mounted Raspberry Pi touchscreen: schedule, deadlines, tasks, habits, goals and the internship search on one glanceable screen. It's built to own its data (one SQLite file) and to stay readable for years (plain JavaScript, plain CSS, few dependencies).

The full design, and the reasons behind it, is in [docs/DESIGN.md](docs/DESIGN.md). Choices made while building it are logged in [docs/DECISIONS.md](docs/DECISIONS.md).

## Status

Being built in phases ([DESIGN §12](docs/DESIGN.md#12-build-plan)).

- **Live:** the server runs on a Google Cloud VM, reachable only over Tailscale ([vm/SETUP.md](vm/SETUP.md)). The database is backed up continuously to Cloud Storage and nightly to Google Drive. All nine widgets work, along with the editors in a ✎ modal and at `/manage` (which works on a phone), and the MCP server for Claude Code ([mcp/README.md](mcp/README.md)).
- **Built, waiting for hardware:** the kiosk, with night mode, the reload rules and the Pi's setup ([kiosk/SETUP.md](kiosk/SETUP.md)).
- **In progress:** phase 7, data an agent can work with. The status line is merged. Richer tasks (deadlines merged in) and a change record with undo are in review.
- **Next:** phases 8 and 9: claude.ai connectors and a scheduled Claude agent ([docs/CONNECTOR.md](docs/CONNECTOR.md), once merged).

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

## Repository layout

Each directory has a README listing its files and what they're for.

| Directory | What's in it |
|---|---|
| [`src/`](src/README.md) | The frontend: the dashboard, the login screen and `/manage` (React, plain CSS) |
| [`server/`](server/README.md) | The Express API, the SQLite database and its migrations, Google Calendar and weather |
| [`shared/`](shared/README.md) | Schemas and date helpers used by the server, the frontend and the MCP server |
| [`mcp/`](mcp/README.md) | The MCP server that lets Claude read and change the dashboard |
| [`vm/`](vm/README.md) | The Google Cloud VM: setup, deploy, services and backups |
| [`kiosk/`](kiosk/README.md) | The Raspberry Pi kiosk's setup |
| [`e2e/`](e2e/README.md) | Browser tests: layout at 8 screen sizes, and full-stack flows |
| [`scripts/`](scripts/README.md) | The backup, the word-list builder and CI's secret check |
| [`docs/`](docs/README.md) | The design, and the decisions made while building |
| `public/` | Files served as-is: the background photo and the favicon |
| `.github/` | The CI workflow (`workflows/ci.yml`) and Dependabot's weekly updates |

At the root: `package.json` (scripts and dependencies), `vite.config.js`, `eslint.config.js`, `playwright.config.js`, `.env.example` (the settings, with how to make tokens), and `.nvmrc` (Node 24).

## Credits

The background photo is by [Sarthaak Maji](https://unsplash.com/@srtkmaji) on [Unsplash](https://unsplash.com/photos/snow-covered-mountain-under-starry-night-dOA35bihSjk), used under the [Unsplash License](https://unsplash.com/license).

The word-of-the-day list is built from [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (MIT), whose definitions come from [CC-CEDICT](https://cc-cedict.org/) (CC BY-SA 4.0). `src/data/words.json` is shared under CC BY-SA 4.0 accordingly.

## License

MIT for the code; see [LICENSE](LICENSE). The word list is CC BY-SA 4.0 (see Credits).
