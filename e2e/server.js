// The real app for the full-stack browser tests, with an in-memory database,
// the fixture calendar and fixed weather, so the tests never touch the network.
import { createApp } from '../server/app.js';
import { combineFeeds, createCalendarFeed } from '../server/calendar.js';
import { openDatabase } from '../server/db.js';

const { API_TOKEN, KIOSK_TOKEN, PORT } = process.env;

const app = createApp({
    db: openDatabase(':memory:'),
    apiToken: API_TOKEN,
    kioskToken: KIOSK_TOKEN,
    build: 'e2e',
    distDir: 'dist',
    calendar: combineFeeds(createCalendarFeed({ cacheFile: new URL('../server/fixtures/calendar.ics', import.meta.url).pathname })),
    weatherAt: async () => ({ temperature: 75, condition: 'Clear', high: 80, low: 60, unit: 'F', fetched_at: new Date().toISOString() }),
});

app.listen(Number(PORT), '127.0.0.1', () => console.log(`e2e server on ${PORT}`));
