import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOGIN_LIMIT } from './auth.js';
import { API_TOKEN, KIOSK_TOKEN, startServer } from './testing.js';

let server;
afterEach(async () => {
    await server?.close();
    server = null;
});

describe('health', () => {
    it('answers without a token and reveals nothing', async () => {
        server = await startServer();
        const res = await server.request('/api/health', { token: null });
        expect(res.status).toBe(200);
        expect(res.text).toBe('');
        expect(res.headers.get('x-build')).toBe('test-build');
    });
});

describe('tokens', () => {
    it('are required on every other API route', async () => {
        server = await startServer();
        for (const token of [null, 'wrong', API_TOKEN.slice(0, -1)]) {
            const res = await server.request('/api/tasks', { token });
            expect(res.status).toBe(401);
            expect(res.body.error.message).toMatch(/token/);
        }
    });

    it('are accepted as a bearer header, either token', async () => {
        server = await startServer();
        expect((await server.request('/api/tasks', { token: API_TOKEN })).status).toBe(200);
        expect((await server.request('/api/tasks', { token: KIOSK_TOKEN })).status).toBe(200);
    });

    it('are accepted from the login cookie', async () => {
        server = await startServer();
        const res = await server.request('/api/tasks', { token: null, headers: { cookie: `dashboard_token=${API_TOKEN}` } });
        expect(res.status).toBe(200);
        const wrong = await server.request('/api/tasks', { token: null, headers: { cookie: 'dashboard_token=nope' } });
        expect(wrong.status).toBe(401);
    });

    it('are needed even for unknown API routes', async () => {
        server = await startServer();
        expect((await server.request('/api/nothing', { token: null })).status).toBe(401);
        const res = await server.request('/api/nothing');
        expect(res.status).toBe(404);
        expect(res.body.error.message).toContain('GET /nothing');
    });
});

describe('login', () => {
    it('sets a long-lived, script-proof cookie for a right token', async () => {
        server = await startServer();
        const res = await server.request('/api/login', { method: 'POST', token: null, body: { token: API_TOKEN } });
        expect(res.status).toBe(204);
        const cookie = res.headers.get('set-cookie');
        expect(cookie).toContain(`dashboard_token=${API_TOKEN}`);
        expect(cookie).toMatch(/HttpOnly/);
        expect(cookie).toMatch(/Secure/);
        expect(cookie).toMatch(/SameSite=Strict/);
        expect(cookie).toMatch(/Max-Age=31536000/);
    });

    it('refuses a wrong token without setting a cookie', async () => {
        server = await startServer();
        const res = await server.request('/api/login', { method: 'POST', token: null, body: { token: 'guess' } });
        expect(res.status).toBe(401);
        expect(res.headers.get('set-cookie')).toBeNull();
    });

    it('validates the body', async () => {
        server = await startServer();
        const res = await server.request('/api/login', { method: 'POST', token: null, body: {} });
        expect(res.status).toBe(400);
    });

    it('locks every login after repeated failures, then unlocks', async () => {
        let time = 1_000_000;
        server = await startServer({ now: () => time });
        const attempt = token => server.request('/api/login', { method: 'POST', token: null, body: { token } });
        for (let i = 0; i < LOGIN_LIMIT.failures; i++) expect((await attempt('guess')).status).toBe(401);
        const locked = await attempt(API_TOKEN);
        expect(locked.status).toBe(429);
        expect(locked.headers.get('set-cookie')).toBeNull();
        time += LOGIN_LIMIT.windowMs;
        expect((await attempt(API_TOKEN)).status).toBe(204);
    });

    it("logs the kiosk in from its link and drops the token from the address", async () => {
        server = await startServer();
        const res = await server.request(`/login?token=${KIOSK_TOKEN}`, { token: null });
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/');
        expect(res.headers.get('set-cookie')).toContain(`dashboard_token=${KIOSK_TOKEN}`);
    });

    it('sends a wrong login link back to the login screen', async () => {
        server = await startServer();
        const res = await server.request('/login?token=wrong', { token: null });
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/login?failed=401');
        expect(res.headers.get('set-cookie')).toBeNull();
    });
});

describe('tasks API', () => {
    it('goes through a full create, read, update, delete cycle', async () => {
        server = await startServer();
        const created = await server.request('/api/tasks', { method: 'POST', body: { name: '  Do laundry  ' } });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ id: 1, name: 'Do laundry', done_at: null });

        const renamed = await server.request('/api/tasks/1', { method: 'PATCH', body: { name: 'Fold laundry' } });
        expect(renamed.body.name).toBe('Fold laundry');

        const doneAt = '2026-09-30T18:00:00.000Z';
        const done = await server.request('/api/tasks/1', { method: 'PATCH', body: { done_at: doneAt } });
        expect(done.body.done_at).toBe(doneAt);
        expect((await server.request('/api/tasks?done=false')).body).toEqual([]);
        expect((await server.request('/api/tasks?done=true')).body).toHaveLength(1);

        const restored = await server.request('/api/tasks/1', { method: 'PATCH', body: { done_at: null } });
        expect(restored.body.done_at).toBeNull();
        expect((await server.request('/api/tasks?done=false')).body).toHaveLength(1);

        const deleted = await server.request('/api/tasks/1', { method: 'DELETE' });
        expect(deleted.status).toBe(204);
        expect((await server.request('/api/tasks')).body).toEqual([]);
    });

    it('rejects invalid bodies with the error shape', async () => {
        server = await startServer();
        const cases = [
            [{}, 'name'],
            [{ name: '   ' }, 'name'],
            [{ name: 'x'.repeat(201) }, 'name'],
            [{ name: 'ok', done_at: null, extra: 1 }, ''],
        ];
        for (const [body, path] of cases) {
            const res = await server.request('/api/tasks', { method: 'POST', body });
            expect(res.status).toBe(400);
            expect(res.body.error.message).toBe('Invalid request');
            expect(res.body.error.details.map(d => d.path)).toContain(path);
        }
    });

    it('rejects invalid updates', async () => {
        server = await startServer();
        await server.request('/api/tasks', { method: 'POST', body: { name: 'x' } });
        for (const body of [{}, { done_at: 'yesterday' }, { done_at: '2026-09-30' }, { name: '' }]) {
            expect((await server.request('/api/tasks/1', { method: 'PATCH', body })).status).toBe(400);
        }
        expect((await server.request('/api/tasks/abc', { method: 'PATCH', body: { name: 'y' } })).status).toBe(400);
        expect((await server.request('/api/tasks?done=maybe')).status).toBe(400);
    });

    it('says when JSON is broken', async () => {
        server = await startServer();
        const res = await server.request('/api/tasks', { method: 'POST', body: '{"name":' });
        expect(res.status).toBe(400);
        expect(res.body.error.message).toBe('The request body is not valid JSON');
    });

    it('answers 404 for a task that does not exist', async () => {
        server = await startServer();
        expect((await server.request('/api/tasks/99', { method: 'PATCH', body: { name: 'x' } })).status).toBe(404);
        const res = await server.request('/api/tasks/99', { method: 'DELETE' });
        expect(res.status).toBe(404);
        expect(res.body.error.message).toBe("There's no task 99");
    });

    it('answers a repeated poll with an empty 304 until something changes', async () => {
        server = await startServer();
        await server.request('/api/tasks', { method: 'POST', body: { name: 'x' } });
        const first = await server.request('/api/tasks');
        expect(first.headers.get('cache-control')).toBe('no-cache, private');
        const etag = first.headers.get('etag');
        expect(etag).toBeTruthy();

        // Node's fetch adds `Cache-Control: no-cache` to conditional requests unless one is
        // given, which tells Express not to answer 304. Browsers revalidating don't send it.
        const conditional = { 'if-none-match': etag, 'cache-control': 'max-age=0' };
        const again = await server.request('/api/tasks', { headers: conditional });
        expect(again.status).toBe(304);
        expect(again.text).toBe('');

        await server.request('/api/tasks', { method: 'POST', body: { name: 'y' } });
        const changed = await server.request('/api/tasks', { headers: conditional });
        expect(changed.status).toBe(200);
        expect(changed.body).toHaveLength(2);
    });

    it('hides internal errors behind a generic message', async () => {
        server = await startServer();
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
        server.db.exec('DROP TABLE tasks');
        const res = await server.request('/api/tasks', { method: 'POST', body: { name: 'x' } });
        expect(res.status).toBe(500);
        expect(res.body.error.message).toBe('Something went wrong on the server');
        expect(quiet).toHaveBeenCalled();
        quiet.mockRestore();
    });
});

describe('frontend files', () => {
    it('are served without a token, with /login and /manage falling back to the app', async () => {
        const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-dist-'));
        fs.mkdirSync(path.join(dist, 'assets'));
        fs.writeFileSync(path.join(dist, 'index.html'), '<div id="root"></div>');
        fs.writeFileSync(path.join(dist, 'assets', 'app-123.js'), 'console.log(1)');
        server = await startServer({ distDir: dist });
        try {
            for (const page of ['/', '/login', '/manage']) {
                const res = await fetch(server.url + page);
                expect(res.status).toBe(200);
                expect(await res.text()).toContain('id="root"');
            }
            const asset = await fetch(server.url + '/assets/app-123.js');
            expect(asset.headers.get('cache-control')).toContain('immutable');
        } finally {
            fs.rmSync(dist, { recursive: true, force: true });
        }
    });
});
