// Starts the server: `npm start` in production, `npm run dev:server` in development.
// Configuration comes from .env (DESIGN §2): API_TOKEN, KIOSK_TOKEN, GCAL_ICS_URL,
// TZ, and optionally GCAL_ROUTINE_ICS_URL, PORT, HOST, DATABASE and BUILD. With
// PUBLIC_URL set, the claude.ai connector's public listener starts too, on
// 127.0.0.1:PUBLIC_PORT (docs/CONNECTOR.md §3), and needs OAUTH_CHAT_CLIENT_ID,
// OAUTH_CHAT_CLIENT_SECRET and OAUTH_REFRESH_KEY.
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { checkTokens } from './auth.js';
import { combineFeeds, createCalendarFeed } from './calendar.js';
import { openDatabase } from './db.js';
import { connectorConfig } from './oauth.js';
import { createWeather } from './weather.js';

const {
    API_TOKEN: apiToken,
    KIOSK_TOKEN: kioskToken,
    PORT = '3000',
    HOST = '127.0.0.1',
    DATABASE = 'data/dashboard.db',
    BUILD = 'dev',
    GCAL_ICS_URL,
    GCAL_ROUTINE_ICS_URL,
    PUBLIC_PORT = '3002',
} = process.env;

let connector;
try {
    checkTokens({ apiToken, kioskToken });
    connector = connectorConfig(process.env);
} catch (err) {
    console.error(`Not starting: ${err.message}. See .env.example.`);
    process.exit(1);
}
if (connector) connector.apiUrl = () => `http://127.0.0.1:${PORT}`;

if (DATABASE !== ':memory:') fs.mkdirSync(path.dirname(DATABASE), { recursive: true });
const db = openDatabase(DATABASE);
const cacheFile = name => (DATABASE === ':memory:' ? null : path.join(path.dirname(DATABASE), 'calendar-cache', name));
// classes, kept off Upcoming (docs/BLOCKS.md §1); optional, so it's only read when set
const routine = GCAL_ROUTINE_ICS_URL ? createCalendarFeed({ url: GCAL_ROUTINE_ICS_URL, cacheFile: cacheFile('routine.ics'), name: 'Classes calendar' }) : null;
const calendar = combineFeeds(createCalendarFeed({ url: GCAL_ICS_URL, cacheFile: cacheFile('calendar.ics') }), routine);
if (!GCAL_ICS_URL) console.warn('GCAL_ICS_URL is not set, so the timeline and birthdays will be empty.');
calendar.start();
const backupStatusFile = DATABASE === ':memory:' ? null : path.join(path.dirname(DATABASE), 'backups', 'last-run.json');
const app = createApp({ db, apiToken, kioskToken, build: BUILD, distDir: 'dist', calendar, weatherAt: createWeather(), backupStatusFile, connector });

const server = app.listen(Number(PORT), HOST, () => {
    console.log(`Dashboard server on http://${HOST}:${PORT} (build ${BUILD}, database ${DATABASE})`);
});
// only on 127.0.0.1: Tailscale Funnel is the one way in (docs/CONNECTOR.md §3)
const publicServer = app.locals.publicApp?.listen(Number(PUBLIC_PORT), '127.0.0.1', () => {
    console.log(`claude.ai connector on http://127.0.0.1:${PUBLIC_PORT}, public as ${connector.publicUrl}`);
});

function shutDown() {
    calendar.stop();
    publicServer?.close();
    server.close(() => {
        db.close();
        process.exit(0);
    });
}
process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);
