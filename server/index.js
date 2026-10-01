// Starts the server: `npm start` in production, `npm run dev:server` in development.
// Configuration comes from .env (DESIGN §2): API_TOKEN, KIOSK_TOKEN, and optionally
// PORT, HOST, DATABASE and BUILD.
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { checkTokens } from './auth.js';
import { openDatabase } from './db.js';

const {
    API_TOKEN: apiToken,
    KIOSK_TOKEN: kioskToken,
    PORT = '3000',
    HOST = '127.0.0.1',
    DATABASE = 'data/dashboard.db',
    BUILD = 'dev',
} = process.env;

try {
    checkTokens({ apiToken, kioskToken });
} catch (err) {
    console.error(`Not starting: ${err.message}. See .env.example.`);
    process.exit(1);
}

if (DATABASE !== ':memory:') fs.mkdirSync(path.dirname(DATABASE), { recursive: true });
const db = openDatabase(DATABASE);
const app = createApp({ db, apiToken, kioskToken, build: BUILD, distDir: 'dist' });

const server = app.listen(Number(PORT), HOST, () => {
    console.log(`Dashboard server on http://${HOST}:${PORT} (build ${BUILD}, database ${DATABASE})`);
});

function shutDown() {
    server.close(() => {
        db.close();
        process.exit(0);
    });
}
process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);
