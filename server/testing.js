// Test helper: runs the app on a random port with a fresh in-memory database.
import { createApp } from './app.js';
import { openDatabase } from './db.js';

export const API_TOKEN = 'test-api-token-0123456789abcdefghijklmnop';
export const KIOSK_TOKEN = 'test-kiosk-token-0123456789abcdefghijklmn';

export async function startServer({ now, distDir } = {}) {
    const db = openDatabase(':memory:');
    const app = createApp({ db, apiToken: API_TOKEN, kioskToken: KIOSK_TOKEN, build: 'test-build', distDir, now });
    const server = await new Promise(resolve => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const url = `http://127.0.0.1:${server.address().port}`;

    // fetch with the API token unless the test passes its own headers
    async function request(path, { method = 'GET', body, token = API_TOKEN, headers = {} } = {}) {
        const all = { ...headers };
        if (token) all.authorization = `Bearer ${token}`;
        if (body !== undefined) all['content-type'] = 'application/json';
        const res = await fetch(url + path, {
            method,
            headers: all,
            body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
            redirect: 'manual',
        });
        const text = await res.text();
        const isJson = res.headers.get('content-type')?.includes('application/json');
        return { status: res.status, headers: res.headers, body: isJson ? JSON.parse(text) : null, text };
    }

    async function close() {
        await new Promise(resolve => server.close(resolve));
        db.close();
    }

    return { url, db, request, close };
}
