// The public listener (docs/CONNECTOR.md §3): the only thing on the internet.
import { afterEach, describe, expect, it } from 'vitest';
import { API_TOKEN, KIOSK_TOKEN, PUBLIC_URL, startServer } from './testing.js';

let server;
let time;
const lines = [];
afterEach(async () => {
    await server?.close();
    server = null;
    lines.length = 0;
});

async function start() {
    time = Date.parse('2026-10-01T12:00:00Z');
    server = await startServer({ connector: { log: line => lines.push(line) }, now: () => time, distDir: null });
    return server;
}

const mcpBody = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
const mcp = (path, token, { headers = {}, ...options } = {}) => server.publicRequest(path, {
    method: 'POST',
    body: mcpBody,
    ...options,
    headers: { accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
});

// Every route the private app serves: the API, its token-free routes, and the
// pages. None of them may answer on the public listener, with any token.
const PRIVATE_ROUTES = [
    ['GET', '/'], ['GET', '/index.html'], ['GET', '/login'], ['GET', '/login?token=x'], ['GET', '/manage'], ['GET', '/connect/abc'],
    ['GET', '/assets/index.js'], ['GET', '/favicon.svg'], ['GET', '/background.jpg'],
    ['GET', '/api/health'], ['POST', '/api/login'], ['GET', '/api/session'], ['GET', '/api/status'], ['GET', '/api/today'], ['GET', '/api/export'],
    ['GET', '/api/tasks'], ['POST', '/api/tasks'], ['PATCH', '/api/tasks/1'], ['DELETE', '/api/tasks/1'],
    ['GET', '/api/countdowns'], ['GET', '/api/goals'], ['POST', '/api/goals/1/increment'], ['GET', '/api/habits'], ['PUT', '/api/habits/1/checks/2026-10-01'],
    ['GET', '/api/applications'], ['POST', '/api/applications/1/advance'], ['GET', '/api/settings'], ['PATCH', '/api/settings'],
    ['GET', '/api/night'], ['POST', '/api/night/start'], ['PUT', '/api/location/kiosk'], ['GET', '/api/weather'],
    ['GET', '/api/events?from=2026-10-01&to=2026-10-02'], ['GET', '/api/birthdays?from=2026-10-01&to=2026-10-02'],
    ['GET', '/api/changes'], ['POST', '/api/changes/1/undo'], ['POST', '/api/changes/undo-since'],
    ['GET', '/api/connectors'], ['PUT', '/api/connectors/chat'], ['GET', '/api/connections'], ['POST', '/api/connections/1/revoke'],
    ['GET', '/api/connect/abc'], ['POST', '/api/connect/abc/approve'],
];

describe('the public listener', () => {
    it('answers 404 to every route of the private app, whatever the token', async () => {
        await start();
        const { access_token: connectorToken } = await server.signIn();
        for (const token of [null, API_TOKEN, KIOSK_TOKEN, connectorToken]) {
            for (const [method, path] of PRIVATE_ROUTES) {
                const res = await server.publicRequest(path, { method, token, body: method === 'GET' ? undefined : {} });
                expect(res.status, `${method} ${path}`).toBe(404);
                expect(res.text).not.toMatch(/<html/i);
            }
        }
    });

    it('sets no-store and no-referrer on everything', async () => {
        await start();
        const res = await server.publicRequest('/.well-known/oauth-authorization-server');
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(res.headers.get('referrer-policy')).toBe('no-referrer');
        expect(res.headers.get('x-powered-by')).toBeNull();
    });

    it('logs each request without its token or body', async () => {
        await start();
        const { access_token: token } = await server.signIn();
        await mcp('/mcp', token);
        await mcp('/mcp', 'made-up-token');
        expect(lines.join('\n')).not.toContain(token);
        expect(lines.join('\n')).not.toContain('made-up-token');
        expect(lines).toContain('public POST /mcp 401 from=unknown connection=- tool=-');
        expect(lines.some(line => /^public POST \/mcp 200 from=unknown connection=\d+ tool=-$/.test(line))).toBe(true);
    });
});

describe('the MCP endpoint', () => {
    it('answers without a token with 401 and where to sign in, before reading the body', async () => {
        await start();
        const res = await server.publicRequest('/mcp', { method: 'POST', body: 'not json at all' });
        expect(res.status).toBe(401);
        expect(res.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp"`);
        const bad = await mcp('/mcp', 'made-up');
        expect(bad.status).toBe(401);
        expect(bad.headers.get('www-authenticate')).toContain('error="invalid_token"');
    });

    it("doesn't accept the owner's or the kiosk's token, only a connector's", async () => {
        await start();
        expect((await mcp('/mcp', API_TOKEN)).status).toBe(401);
        expect((await mcp('/mcp', KIOSK_TOKEN)).status).toBe(401);
    });

    it("refuses one connector's token at the other's endpoint", async () => {
        await start();
        const chat = await server.signIn('chat');
        const agent = await server.signIn('agent');
        expect((await mcp('/mcp/agent', chat.access_token)).status).toBe(401);
        expect((await mcp('/mcp', agent.access_token)).status).toBe(401);
    });

    it('refuses requests from a browser page', async () => {
        await start();
        const { access_token: token } = await server.signIn();
        const res = await mcp('/mcp', token, { headers: { origin: 'https://evil.example' } });
        expect(res.status).toBe(403);
    });

    it('takes only POST, and bodies up to 64 KB', async () => {
        await start();
        const { access_token: token } = await server.signIn();
        const get = await server.publicRequest('/mcp', { token });
        expect(get.status).toBe(405);
        expect(get.headers.get('allow')).toBe('POST');
        expect((await server.publicRequest('/mcp', { method: 'DELETE', token })).status).toBe(405);
        const big = await mcp('/mcp', token, { body: { ...mcpBody, params: { padding: 'x'.repeat(70_000) } } });
        expect(big.status).toBe(413);
        expect((await mcp('/mcp', token)).status).toBe(200);
    });

    it('stops an expired token or a revoked connection', async () => {
        await start();
        const first = await server.signIn();
        time += 60 * 60 * 1000;
        expect((await mcp('/mcp', first.access_token)).status).toBe(401);
        const second = await server.signIn();
        const [connection] = (await server.request('/api/connections')).body;
        await server.request(`/api/connections/${connection.id}/revoke`, { method: 'POST' });
        expect((await mcp('/mcp', second.access_token)).status).toBe(401);
    });

    it('limits strangers by address, without touching a valid connection', async () => {
        await start();
        const { access_token: token } = await server.signIn();
        const stranger = { 'x-forwarded-for': '1.2.3.4, 203.0.113.50' };
        for (let i = 0; i < 60; i++) expect((await mcp('/mcp', null, { headers: stranger })).status).toBe(401);
        expect((await mcp('/mcp', null, { headers: stranger })).status).toBe(429);
        // faking an earlier X-Forwarded-For entry changes nothing: only the last counts
        expect((await mcp('/mcp', null, { headers: { 'x-forwarded-for': '9.9.9.9, 203.0.113.50' } })).status).toBe(429);
        expect((await mcp('/mcp', null, { headers: { 'x-forwarded-for': '203.0.113.51' } })).status).toBe(401);
        expect((await mcp('/mcp', token, { headers: stranger })).status).toBe(200);
    });

    it('caps unknown requests overall, still without touching a valid connection', async () => {
        await start();
        const { access_token: token } = await server.signIn();
        for (let i = 0; i < 600; i++) await mcp('/mcp', null, { headers: { 'x-forwarded-for': `10.9.${Math.floor(i / 50)}.${i % 50}` } });
        expect((await mcp('/mcp', null, { headers: { 'x-forwarded-for': '10.10.0.1' } })).status).toBe(429);
        expect((await mcp('/mcp', token)).status).toBe(200);
    });

    it('limits each connection to 120 requests a minute', async () => {
        await start();
        const { access_token: token } = await server.signIn();
        const other = await server.signIn();
        for (let i = 0; i < 120; i++) await mcp('/mcp', token);
        expect((await mcp('/mcp', token)).status).toBe(429);
        expect((await mcp('/mcp', other.access_token)).status).toBe(200);
        time += 60 * 1000;
        expect((await mcp('/mcp', token)).status).toBe(200);
    });
});
