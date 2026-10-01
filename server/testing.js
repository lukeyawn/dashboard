// Test helper: runs the app on a random port with a fresh in-memory database.
import crypto from 'node:crypto';
import { createApp } from './app.js';
import { openDatabase } from './db.js';

export const API_TOKEN = 'test-api-token-0123456789abcdefghijklmnop';
export const KIOSK_TOKEN = 'test-kiosk-token-0123456789abcdefghijklmn';

// the claude.ai connector's settings in tests (docs/CONNECTOR.md); the public
// and tailnet addresses are only names here, since the tests call the
// listeners on their random ports
export const PUBLIC_URL = 'https://dashboard.test:8443';
export const TAILNET_URL = 'https://dashboard.test';
export const CLIENTS = {
    chat: { id: 'test-chat-client-0123456789abcdefghij', secret: 'test-chat-secret-0123456789abcdefghij' },
    agent: { id: 'test-agent-client-0123456789abcdefghi', secret: 'test-agent-secret-0123456789abcdefghi' },
};
export const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

const listen = app => new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
});

// options: now, distDir, calendar and weatherAt, passed on to createApp;
// connector: true (or { clients }) also starts the public listener
export async function startServer({ connector, ...options } = {}) {
    const db = openDatabase(':memory:');
    let url;
    const connectorOptions = connector && {
        publicUrl: PUBLIC_URL,
        tailnetUrl: TAILNET_URL,
        clients: connector.clients ?? CLIENTS,
        refreshKey: 'test-refresh-key-0123456789abcdefghijk',
        apiUrl: () => url,
        log: connector.log ?? (() => {}),
    };
    const app = createApp({ db, apiToken: API_TOKEN, kioskToken: KIOSK_TOKEN, build: 'test-build', ...options, connector: connectorOptions });
    const server = await listen(app);
    url = `http://127.0.0.1:${server.address().port}`;
    const publicServer = app.locals.publicApp ? await listen(app.locals.publicApp) : null;
    const publicUrl = publicServer && `http://127.0.0.1:${publicServer.address().port}`;

    // fetch with the API token unless the test passes its own headers;
    // base: which listener, the private one unless given
    async function request(path, { method = 'GET', body, token = API_TOKEN, headers = {}, base = url } = {}) {
        const all = { ...headers };
        if (token) all.authorization = `Bearer ${token}`;
        if (body !== undefined && !all['content-type']) all['content-type'] = 'application/json';
        const res = await fetch(base + path, {
            method,
            headers: all,
            body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
            redirect: 'manual',
        });
        const text = await res.text();
        const isJson = res.headers.get('content-type')?.includes('application/json');
        return { status: res.status, headers: res.headers, body: isJson ? JSON.parse(text) : null, text };
    }

    const publicRequest = (path, options = {}) => request(path, { token: null, ...options, base: publicUrl });

    // the whole sign-in, as claude.ai and the owner do it: authorize on the
    // public listener, approve on the tailnet with the connect cookie, then
    // trade the code for tokens
    async function signIn(connectorName = 'chat') {
        const client = (connector.clients ?? CLIENTS)[connectorName];
        const verifier = crypto.randomBytes(32).toString('base64url');
        const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        const query = new URLSearchParams({
            response_type: 'code', client_id: client.id, redirect_uri: REDIRECT_URI,
            code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz',
        });
        const authorized = await publicRequest(`/oauth/authorize?${query}`);
        const id = new URL(authorized.headers.get('location')).pathname.split('/').pop();
        const cookie = authorized.headers.get('set-cookie').split(';')[0];
        const approved = await request(`/api/connect/${id}/approve`, { method: 'POST', headers: { cookie } });
        const code = new URL(approved.body.redirect).searchParams.get('code');
        const issued = await publicRequest('/oauth/token', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier,
                client_id: client.id, client_secret: client.secret,
            }).toString(),
        });
        return issued.body;
    }

    async function close() {
        if (publicServer) await new Promise(resolve => publicServer.close(resolve));
        await new Promise(resolve => server.close(resolve));
        db.close();
    }

    return { url, publicUrl, db, request, publicRequest, signIn, close };
}
