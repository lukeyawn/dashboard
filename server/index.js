// Starts the server: `npm start` in production, `npm run dev:server` in development.
// Configuration comes from .env (DESIGN §2): API_TOKEN, KIOSK_TOKEN, GCAL_ICS_URL,
// TZ, and optionally PORT, HOST, DATABASE and BUILD.
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { checkTokens } from './auth.js';
import { createCalendarFeed } from './calendar.js';
import { openDatabase } from './db.js';
import { createWeather } from './weather.js';

const {
    API_TOKEN: apiToken,
    KIOSK_TOKEN: kioskToken,
    PORT = '3000',
    HOST = '127.0.0.1',
    DATABASE = 'data/dashboard.db',
    BUILD = 'dev',
    GCAL_ICS_URL,
} = process.env;

try {
    checkTokens({ apiToken, kioskToken });
} catch (err) {
    console.error(`Not starting: ${err.message}. See .env.example.`);
    process.exit(1);
}

if (DATABASE !== ':memory:') fs.mkdirSync(path.dirname(DATABASE), { recursive: true });
const db = openDatabase(DATABASE);
const calendar = createCalendarFeed({
    url: GCAL_ICS_URL,
    cacheFile: DATABASE === ':memory:' ? null : path.join(path.dirname(DATABASE), 'calendar-cache', 'calendar.ics'),
});
if (!GCAL_ICS_URL) console.warn('GCAL_ICS_URL is not set, so the timeline and birthdays will be empty.');
calendar.start();
const app = createApp({ db, apiToken, kioskToken, build: BUILD, distDir: 'dist', calendar, weatherAt: createWeather() });

const server = app.listen(Number(PORT), HOST, () => {
    console.log(`Dashboard server on http://${HOST}:${PORT} (build ${BUILD}, database ${DATABASE})`);
});

function shutDown() {
    calendar.stop();
    server.close(() => {
        db.close();
        process.exit(0);
    });
}
process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);
