// Sign-in for the claude.ai connectors (docs/CONNECTOR.md §4), through both
// listeners, the way claude.ai and the owner's browser use them.
import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { connectorConfig } from './oauth.js';
import { API_TOKEN, CLIENTS, KIOSK_TOKEN, PUBLIC_URL, REDIRECT_URI, TAILNET_URL, startServer } from './testing.js';

let server;
let time;
afterEach(async () => {
    await server?.close();
    server = null;
});

async function start(options = {}) {
    time = Date.parse('2026-10-01T12:00:00Z');
    server = await startServer({ connector: true, now: () => time, ...options });
    return server;
}

const verifier = 'v'.repeat(50);
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const form = body => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });

function authorizeQuery(overrides = {}) {
    const params = {
        response_type: 'code', client_id: CLIENTS.chat.id, redirect_uri: REDIRECT_URI,
        code_challenge: challenge, code_challenge_method: 'S256', state: 'state-1', ...overrides,
    };
    for (const [key, value] of Object.entries(params)) if (value === undefined) delete params[key];
    return `/oauth/authorize?${new URLSearchParams(params)}`;
}

// authorize, and return the pending id and the connect cookie
async function authorize(overrides) {
    const res = await server.publicRequest(authorizeQuery(overrides));
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location'));
    return { res, location, id: location.pathname.split('/').pop(), cookie: res.headers.get('set-cookie').split(';')[0] };
}

const approve = (id, cookie) => server.request(`/api/connect/${id}/approve`, { method: 'POST', headers: cookie ? { cookie } : {} });

async function codeFor(overrides) {
    const { id, cookie } = await authorize(overrides);
    const res = await approve(id, cookie);
    return new URL(res.body.redirect).searchParams.get('code');
}

const exchange = (code, extra = {}) => server.publicRequest('/oauth/token', form({
    grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier,
    client_id: CLIENTS.chat.id, client_secret: CLIENTS.chat.secret, ...extra,
}));

describe('metadata', () => {
    it('describes each resource and the authorization server, on the public origin', async () => {
        await start();
        const chat = await server.publicRequest('/.well-known/oauth-protected-resource/mcp');
        expect(chat.body).toMatchObject({ resource: `${PUBLIC_URL}/mcp`, authorization_servers: [PUBLIC_URL] });
        expect((await server.publicRequest('/.well-known/oauth-protected-resource')).body.resource).toBe(`${PUBLIC_URL}/mcp`);
        expect((await server.publicRequest('/.well-known/oauth-protected-resource/mcp/agent')).body).toMatchObject({ resource: `${PUBLIC_URL}/mcp/agent`, resource_name: 'Dashboard (agent)' });
        const as = (await server.publicRequest('/.well-known/oauth-authorization-server')).body;
        expect(as).toMatchObject({
            issuer: PUBLIC_URL,
            authorization_endpoint: `${PUBLIC_URL}/oauth/authorize`,
            token_endpoint: `${PUBLIC_URL}/oauth/token`,
            code_challenge_methods_supported: ['S256'],
        });
        expect(as.registration_endpoint).toBeUndefined();
    });

    it('describes only configured connectors', async () => {
        await start({ connector: { clients: { chat: CLIENTS.chat } } });
        expect((await server.publicRequest('/.well-known/oauth-protected-resource/mcp/agent')).status).toBe(404);
    });
});

describe('authorize', () => {
    it('redirects to the approval page on the tailnet and sets the connect cookie, with no page of its own', async () => {
        await start();
        const { res, location } = await authorize();
        expect(location.origin).toBe(TAILNET_URL);
        expect(location.pathname).toMatch(/^\/connect\/[\w-]{20,}$/);
        expect(res.headers.get('set-cookie')).toMatch(/^dashboard_connect_[\w-]+=[\w-]+; Max-Age=300; Path=\/; Expires=.*; HttpOnly; Secure; SameSite=Lax$/);
        expect(res.text).not.toMatch(/<form|<input/i);
    });

    it('refuses an unknown client or a redirect address off the list, without redirecting', async () => {
        await start();
        for (const overrides of [
            { client_id: 'someone-else' },
            { redirect_uri: 'https://evil.example/callback' },
            { redirect_uri: `${REDIRECT_URI}/` },
            { redirect_uri: 'https://claude.ai/api/mcp/auth_callbackx' },
            { redirect_uri: undefined },
        ]) {
            const res = await server.publicRequest(authorizeQuery(overrides));
            expect(res.status).toBe(400);
            expect(res.headers.get('location')).toBeNull();
        }
    });

    it('accepts claude.com as well as claude.ai', async () => {
        await start();
        await authorize({ redirect_uri: 'https://claude.com/api/mcp/auth_callback' });
    });

    it('sends other errors back to claude.ai with the state', async () => {
        await start();
        const cases = [
            [{ response_type: 'token' }, 'unsupported_response_type'],
            [{ code_challenge: undefined }, 'invalid_request'],
            [{ code_challenge_method: 'plain' }, 'invalid_request'],
            [{ code_challenge: 'short' }, 'invalid_request'],
            [{ state: 's'.repeat(1001) }, 'invalid_request'],
            [{ resource: `${PUBLIC_URL}/mcp/agent` }, 'invalid_target'],
            [{ resource: 'https://elsewhere.example/mcp' }, 'invalid_target'],
        ];
        for (const [overrides, error] of cases) {
            const res = await server.publicRequest(authorizeQuery(overrides));
            expect(res.status).toBe(302);
            const location = new URL(res.headers.get('location'));
            expect(location.origin + location.pathname).toBe(REDIRECT_URI);
            expect(location.searchParams.get('error')).toBe(error);
            if (overrides.state === undefined) expect(location.searchParams.get('state')).toBe('state-1');
        }
    });

    it('accepts a resource that matches the client, or none', async () => {
        await start();
        await authorize({ resource: `${PUBLIC_URL}/mcp` });
        await authorize({ client_id: CLIENTS.agent.id, resource: `${PUBLIC_URL}/mcp/agent` });
    });

    it('refuses while the connector is switched off', async () => {
        await start();
        await server.request('/api/connectors/chat', { method: 'PUT', body: { enabled: false } });
        const res = await server.publicRequest(authorizeQuery());
        expect(new URL(res.headers.get('location')).searchParams.get('error')).toBe('access_denied');
    });

    it('is rate-limited per visitor', async () => {
        await start();
        const visitor = { 'x-forwarded-for': '203.0.113.5' };
        for (let i = 0; i < 20; i++) expect((await server.publicRequest(authorizeQuery(), { headers: visitor })).status).toBe(302);
        expect((await server.publicRequest(authorizeQuery(), { headers: visitor })).status).toBe(429);
        // someone else still gets through
        expect((await server.publicRequest(authorizeQuery(), { headers: { 'x-forwarded-for': '198.51.100.7' } })).status).toBe(302);
    });

    it("can't be blocked by a flood of pending sign-ins: a new one pushes out the oldest", async () => {
        await start();
        const first = await authorize();
        for (let i = 0; i < 10; i++) await server.publicRequest(authorizeQuery(), { headers: { 'x-forwarded-for': `10.0.0.${i}` } });
        expect((await approve(first.id, first.cookie)).status).toBe(404);
        const latest = await authorize();
        expect((await approve(latest.id, latest.cookie)).status).toBe(200);
    });
});

describe('approval on the tailnet', () => {
    it('describes the request and whether this browser started it', async () => {
        await start();
        const { id, cookie } = await authorize();
        const res = await server.request(`/api/connect/${id}`, { headers: { cookie } });
        expect(res.body).toMatchObject({ connector: 'chat', same_browser: true });
        expect(res.body.access).toMatch(/can't delete/);
        expect((await server.request(`/api/connect/${id}`)).body.same_browser).toBe(false);
        expect((await server.request('/api/connect/nope')).status).toBe(404);
        const agent = await authorize({ client_id: CLIENTS.agent.id });
        const agentAccess = (await server.request(`/api/connect/${agent.id}`, { headers: { cookie: agent.cookie } })).body.access;
        expect(agentAccess).toMatch(/add and change it \(no deleting\), as the scheduled agent/);
        expect(agentAccess).toMatch(/at most 30 changes a day/);
    });

    it('needs the owner logged in, and the browser that started it', async () => {
        await start();
        const { id, cookie } = await authorize();
        expect((await server.request(`/api/connect/${id}/approve`, { method: 'POST', token: null, headers: { cookie } })).status).toBe(401);
        expect((await server.request(`/api/connect/${id}/approve`, { method: 'POST', token: KIOSK_TOKEN, headers: { cookie } })).status).toBe(403);
        const otherBrowser = await approve(id, 'dashboard_connect_x=guess');
        expect(otherBrowser.status).toBe(403);
        expect(otherBrowser.body.error.message).toMatch(/different browser/);
        expect((await approve(id, `${cookie.split('=')[0]}=wrong`)).status).toBe(403);
        expect((await approve(id)).status).toBe(403);
        const ok = await approve(id, cookie);
        expect(ok.status).toBe(200);
        const redirect = new URL(ok.body.redirect);
        expect(redirect.origin + redirect.pathname).toBe(REDIRECT_URI);
        expect(redirect.searchParams.get('state')).toBe('state-1');
        expect(redirect.searchParams.get('code')).toMatch(/^[\w-]{40,}$/);
        expect(ok.headers.get('set-cookie')).toMatch(/dashboard_connect_.*Expires=Thu, 01 Jan 1970/);
        // used up
        expect((await approve(id, cookie)).status).toBe(404);
    });

    it('expires after 5 minutes', async () => {
        await start();
        const { id, cookie } = await authorize();
        time += 5 * 60 * 1000;
        expect((await approve(id, cookie)).status).toBe(404);
    });

    it('can be denied, which tells claude.ai', async () => {
        await start();
        const { id } = await authorize();
        const res = await server.request(`/api/connect/${id}/deny`, { method: 'POST' });
        expect(new URL(res.body.redirect).searchParams.get('error')).toBe('access_denied');
        expect((await server.request(`/api/connect/${id}/deny`, { method: 'POST' })).status).toBe(404);
    });

    it("refuses to approve once the connector's been switched off", async () => {
        await start();
        const { id, cookie } = await authorize();
        await server.request('/api/connectors/chat', { method: 'PUT', body: { enabled: false } });
        // switching off drops waiting sign-ins
        expect((await approve(id, cookie)).status).toBe(404);
    });
});

describe('token', () => {
    it('trades a code for tokens once, with the right verifier, redirect and client', async () => {
        await start();
        const res = await exchange(await codeFor());
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
        expect(res.body.access_token).toMatch(/^[\w-]{40,}$/);
        expect(res.body.refresh_token).toMatch(/^[\w-]{40,}$/);
    });

    it('refuses a code twice, late, or with the wrong verifier, redirect, client or resource', async () => {
        await start();
        const code = await codeFor();
        expect((await exchange(code)).status).toBe(200);
        expect((await exchange(code)).body.error).toBe('invalid_grant');

        const late = await codeFor();
        time += 60 * 1000;
        expect((await exchange(late)).body.error).toBe('invalid_grant');

        for (const extra of [
            { code_verifier: 'w'.repeat(50) },
            { redirect_uri: 'https://claude.com/api/mcp/auth_callback' },
            { client_id: CLIENTS.agent.id, client_secret: CLIENTS.agent.secret },
        ]) {
            const res = await exchange(await codeFor(), extra);
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('invalid_grant');
        }
        expect((await exchange(await codeFor(), { resource: `${PUBLIC_URL}/mcp/agent` })).body.error).toBe('invalid_target');
        expect((await exchange(undefined, { code: '' })).body.error).toBe('invalid_grant');
        expect((await server.publicRequest('/oauth/token', form({ grant_type: 'authorization_code', client_id: CLIENTS.chat.id, client_secret: CLIENTS.chat.secret }))).body.error).toBe('invalid_request');
    });

    it('accepts the client secret as HTTP Basic too', async () => {
        await start();
        const code = await codeFor();
        const basic = Buffer.from(`${CLIENTS.chat.id}:${CLIENTS.chat.secret}`).toString('base64');
        const res = await server.publicRequest('/oauth/token', {
            ...form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier }),
            headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
        });
        expect(res.status).toBe(200);
    });

    it('refuses a wrong secret, then locks that visitor out without touching the dashboard login', async () => {
        await start();
        const wrong = { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.9' };
        const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'x', client_id: CLIENTS.chat.id, client_secret: 'guess' }).toString();
        for (let i = 0; i < 10; i++) {
            const res = await server.publicRequest('/oauth/token', { method: 'POST', headers: wrong, body });
            expect(res.status).toBe(401);
            expect(res.body.error).toBe('invalid_client');
        }
        expect((await server.publicRequest('/oauth/token', { method: 'POST', headers: wrong, body })).status).toBe(429);
        // the dashboard login is unaffected, and claude.ai from elsewhere still works
        expect((await server.request('/api/login', { method: 'POST', token: null, body: { token: API_TOKEN } })).status).toBe(204);
        expect((await exchange(await codeFor())).status).toBe(200);
        time += 15 * 60 * 1000;
        expect((await server.publicRequest('/oauth/token', { method: 'POST', headers: wrong, body })).status).toBe(401);
    });

    it('caps wrong secrets overall too, so rotating addresses gets nowhere', async () => {
        await start();
        const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'x', client_id: 'nobody', client_secret: 'guess' }).toString();
        for (let i = 0; i < 30; i++) {
            await server.publicRequest('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': `10.1.0.${i}` }, body });
        }
        const res = await server.publicRequest('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '10.2.0.1' }, body });
        expect(res.status).toBe(429);
    });

    it('refreshes, rotating the token, and keeps clients apart', async () => {
        await start();
        const first = (await exchange(await codeFor())).body;
        const refresh = (token, client = CLIENTS.chat) => server.publicRequest('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: token, client_id: client.id, client_secret: client.secret }));
        const second = await refresh(first.refresh_token);
        expect(second.status).toBe(200);
        expect(second.body.refresh_token).not.toBe(first.refresh_token);
        // a repeat in the grace window gets the same replacement
        expect((await refresh(first.refresh_token)).body.refresh_token).toBe(second.body.refresh_token);
        expect((await refresh(second.body.refresh_token, CLIENTS.agent)).body.error).toBe('invalid_grant');
        expect((await refresh('made-up')).body.error).toBe('invalid_grant');
    });

    it('refuses an unknown grant type, and refreshing while switched off', async () => {
        await start();
        const first = (await exchange(await codeFor())).body;
        const creds = { client_id: CLIENTS.chat.id, client_secret: CLIENTS.chat.secret };
        expect((await server.publicRequest('/oauth/token', form({ grant_type: 'password', ...creds }))).body.error).toBe('unsupported_grant_type');
        await server.request('/api/connectors/chat', { method: 'PUT', body: { enabled: false } });
        expect((await server.publicRequest('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: first.refresh_token, ...creds }))).body.error).toBe('invalid_grant');
    });

    it('rate-limits a client with the right secret', async () => {
        await start();
        const creds = { grant_type: 'refresh_token', refresh_token: 'x', client_id: CLIENTS.chat.id, client_secret: CLIENTS.chat.secret };
        for (let i = 0; i < 30; i++) expect((await server.publicRequest('/oauth/token', form(creds))).status).toBe(400);
        expect((await server.publicRequest('/oauth/token', form(creds))).status).toBe(429);
    });
});

describe('connectorConfig', () => {
    const strong = 'x'.repeat(32);
    const env = {
        PUBLIC_URL: 'https://dashboard.tail.ts.net',
        TAILNET_URL: 'https://dashboard.tail.ts.net:8443',
        OAUTH_CHAT_CLIENT_ID: `chat${strong}`, OAUTH_CHAT_CLIENT_SECRET: strong, OAUTH_REFRESH_KEY: strong,
    };

    it('is off without PUBLIC_URL', () => {
        expect(connectorConfig({})).toBeNull();
    });

    it('reads the settings', () => {
        expect(connectorConfig(env)).toEqual({
            publicUrl: 'https://dashboard.tail.ts.net',
            tailnetUrl: 'https://dashboard.tail.ts.net:8443',
            clients: { chat: { id: `chat${strong}`, secret: strong } },
            refreshKey: strong,
        });
        expect(connectorConfig({ ...env, PUBLIC_URL: 'https://dashboard.tail.ts.net:443/' }).publicUrl).toBe('https://dashboard.tail.ts.net');
        const withAgent = connectorConfig({ ...env, OAUTH_AGENT_CLIENT_ID: `agent${strong}`, OAUTH_AGENT_CLIENT_SECRET: strong });
        expect(withAgent.clients.agent.id).toBe(`agent${strong}`);
    });

    it('refuses a bad address, weak secrets or a shared client id', () => {
        expect(() => connectorConfig({ ...env, PUBLIC_URL: 'not a url' })).toThrow(/full address/);
        expect(() => connectorConfig({ ...env, PUBLIC_URL: 'http://dashboard.tail.ts.net' })).toThrow(/https/);
        expect(() => connectorConfig({ ...env, PUBLIC_URL: 'https://dashboard.tail.ts.net/mcp' })).toThrow(/no path/);
        // claude.ai can't reach any other port
        expect(() => connectorConfig({ ...env, PUBLIC_URL: 'https://dashboard.tail.ts.net:8443' })).toThrow(/no port/);
        expect(() => connectorConfig({ ...env, TAILNET_URL: undefined })).toThrow(/TAILNET_URL must be set/);
        // elsewhere, the approval page would never get the connect cookie
        expect(() => connectorConfig({ ...env, TAILNET_URL: 'https://other.tail.ts.net:8443' })).toThrow(/same host/);
        expect(() => connectorConfig({ ...env, TAILNET_URL: 'https://dashboard.tail.ts.net' })).toThrow(/another port/);
        expect(() => connectorConfig({ ...env, OAUTH_CHAT_CLIENT_SECRET: 'short' })).toThrow(/OAUTH_CHAT_CLIENT_SECRET/);
        expect(() => connectorConfig({ ...env, OAUTH_REFRESH_KEY: undefined })).toThrow(/OAUTH_REFRESH_KEY/);
        expect(() => connectorConfig({ ...env, OAUTH_AGENT_CLIENT_ID: `chat${strong}`, OAUTH_AGENT_CLIENT_SECRET: strong })).toThrow(/different/);
        expect(() => connectorConfig({ ...env, OAUTH_AGENT_CLIENT_ID: `agent${strong}` })).toThrow(/OAUTH_AGENT_CLIENT_SECRET/);
    });
});

describe('connections and switches on /manage', () => {
    it('lists the connectors, and switching one off revokes its connections at once', async () => {
        await start();
        const chat = await server.signIn('chat');
        const agent = await server.signIn('agent');
        const connectors = (await server.request('/api/connectors')).body;
        expect(connectors).toEqual([
            { name: 'chat', configured: true, enabled: true, url: `${PUBLIC_URL}/mcp`, writes_today: 0, write_cap: 100 },
            { name: 'agent', configured: true, enabled: true, url: `${PUBLIC_URL}/mcp/agent`, writes_today: 0, write_cap: 30, runs_today: 0, run_cap: 5 },
        ]);
        const off = await server.request('/api/connectors/chat', { method: 'PUT', body: { enabled: false } });
        expect(off.body.enabled).toBe(false);
        const reasons = (await server.request('/api/connections')).body.map(c => [c.connector, c.end_reason, c.end_reason_text]);
        expect(reasons).toEqual([['agent', null, null], ['chat', 'switched_off', 'You switched the connector off']]);
        const refresh = (token, client) => server.publicRequest('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: token, client_id: client.id, client_secret: client.secret }));
        expect((await refresh(chat.refresh_token, CLIENTS.chat)).body.error).toBe('invalid_grant');
        expect((await refresh(agent.refresh_token, CLIENTS.agent)).status).toBe(200);
        // back on: new sign-ins only
        await server.request('/api/connectors/chat', { method: 'PUT', body: { enabled: true } });
        expect((await refresh(chat.refresh_token, CLIENTS.chat)).body.error).toBe('invalid_grant');
        expect((await server.signIn('chat')).access_token).toBeTruthy();
        // the switch is recorded like any setting
        const [change] = (await server.request('/api/changes?resource=settings')).body;
        expect(change.item_id).toBe('connector_chat_enabled');
    });

    it('validates the switch', async () => {
        await start();
        expect((await server.request('/api/connectors/nobody', { method: 'PUT', body: { enabled: false } })).status).toBe(400);
        expect((await server.request('/api/connectors/chat', { method: 'PUT', body: { enabled: 'no' } })).status).toBe(400);
    });

    it('revokes one connection', async () => {
        await start();
        await server.signIn('chat');
        const [connection] = (await server.request('/api/connections')).body;
        expect((await server.request(`/api/connections/${connection.id}/revoke`, { method: 'POST' })).status).toBe(204);
        expect((await server.request(`/api/connections/${connection.id}/revoke`, { method: 'POST' })).status).toBe(404);
        expect((await server.request('/api/connections')).body[0].end_reason_text).toBe('You revoked it');
        // the owner revoking it isn't a lost connection
        expect((await server.request('/api/status')).body.problems).toEqual([]);
    });

    it('shows a lost connection in the status line until a new one is approved', async () => {
        await start();
        const first = await server.signIn('chat');
        const refresh = token => server.publicRequest('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: token, client_id: CLIENTS.chat.id, client_secret: CLIENTS.chat.secret }));
        const second = (await refresh(first.refresh_token)).body;
        await refresh(second.refresh_token);
        // the first token again, after its replacement was used: a copy exists
        await refresh(first.refresh_token);
        const status = (await server.request('/api/status')).body;
        expect(status.problems).toEqual([{ kind: 'connector-chat', message: 'claude.ai disconnected: reconnect' }]);
        await server.signIn('chat');
        expect((await server.request('/api/status')).body.problems).toEqual([]);
    });

    it('answers sensibly when the connector is not set up', async () => {
        server = await startServer();
        expect((await server.request('/api/connectors')).body).toEqual([
            { name: 'chat', configured: false, enabled: true, url: null, writes_today: 0, write_cap: 100 },
            { name: 'agent', configured: false, enabled: true, url: null, writes_today: 0, write_cap: 30, runs_today: 0, run_cap: 5 },
        ]);
        expect((await server.request('/api/connections')).body).toEqual([]);
        expect((await server.request('/api/connections/1/revoke', { method: 'POST' })).status).toBe(404);
        expect((await server.request('/api/connectors/chat', { method: 'PUT', body: { enabled: false } })).status).toBe(200);
        expect((await server.request('/api/connect/x')).status).toBe(404);
    });
});
