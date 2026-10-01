# e2e/

Browser tests with Playwright (Chromium), run with `npm run e2e` and by CI's `layout` job (DESIGN §13). Configured in `playwright.config.js` at the repo root.

| File | Purpose |
|---|---|
| `layout.spec.js` | The dashboard at 8 screen sizes, from 4:3 to 21:9 and up to 4K. It checks for no page scroll, no overflowing tile, every tap target at least `--hit`, the same body text size in every widget, and long names truncating. It runs against a production build with the API mocked, and saves a screenshot of each size to `test-results/screens/`. |
| `fullstack.spec.js` | The first vertical slice against the real server and database: logging in, adding a task and clearing it after 5 seconds, and every widget loading. |
| `editing.spec.js` | Editing through the ✎ modal and on `/manage`, against the real server. |
| `night.spec.js` | Night mode in a real browser. It's one setting on the shared test server, so all its tests are in this file and run in order. |
| `server.js` | The real app for the full-stack tests, with an in-memory database, the fixture calendar and fixed weather, so nothing touches the network. |
| `fixtures/api.js` | Mock API data for the layout checks. The clock is fixed, and names are long enough to prove they truncate instead of breaking a tile. |
