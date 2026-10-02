// What a claude.ai connector's token may do on the API (docs/CONNECTOR.md §5).
import { afterEach, describe, expect, it } from 'vitest';
import { ALLOWED, WRITE_CAP, isAllowed, startOfToday } from './access.js';
import { startServer } from './testing.js';

let server;
afterEach(async () => {
    await server?.close();
    server = null;
});

async function start() {
    server = await startServer({ connector: true });
    const { access_token: token } = await server.signIn('chat');
    // a request as claude.ai's chat connector, straight to the private API
    const asClaude = (path, options = {}) => server.request(path, { ...options, token });
    return asClaude;
}

describe('isAllowed', () => {
    it('lets the chat connector read, add and change, but never delete', () => {
        const allowed = [
            ['GET', '/today'], ['GET', '/tasks'], ['GET', '/tasks/'], ['GET', '/settings'], ['GET', '/night'], ['GET', '/events'],
            ['POST', '/tasks'], ['PATCH', '/tasks/12'], ['POST', '/goals/3/increment'], ['POST', '/applications/4/advance'],
            ['PATCH', '/settings'], ['POST', '/night/start'], ['POST', '/night/cancel'],
            ['PUT', '/habits/2/checks/2026-10-01'], ['DELETE', '/habits/2/checks/2026-10-01'],
        ];
        const refused = [
            ['DELETE', '/tasks/12'], ['DELETE', '/habits/2'], ['GET', '/export'], ['GET', '/changes'], ['POST', '/changes/1/undo'],
            ['POST', '/changes/undo-since'], ['GET', '/connectors'], ['PUT', '/connectors/chat'], ['GET', '/connections'],
            ['POST', '/connections/1/revoke'], ['GET', '/connect/x'], ['POST', '/connect/x/approve'], ['PUT', '/location/kiosk'],
            ['GET', '/session'], ['GET', '/status'], ['GET', '/weather'], ['POST', '/login'], ['GET', '/tasks/12/../../export'],
            ['PATCH', '/tasks'], ['POST', '/tasks/12'], ['GET', '/nothing'], ['PATCH', '/goals/x'],
        ];
        for (const [method, path] of allowed) expect(isAllowed('chat', method, path), `${method} ${path}`).toBe(true);
        for (const [method, path] of refused) expect(isAllowed('chat', method, path), `${method} ${path}`).toBe(false);
    });

    it('allows the agent connector nothing yet, and an unknown connector nothing', () => {
        expect(ALLOWED.agent).toEqual([]);
        expect(isAllowed('agent', 'GET', '/today')).toBe(false);
        expect(isAllowed('nobody', 'GET', '/today')).toBe(false);
    });

    it('counts the day from midnight in the dashboard time zone', () => {
        // tests run in America/Chicago: midnight there is 05:00 UTC in October
        expect(startOfToday(Date.parse('2026-10-01T15:00:00Z'))).toBe('2026-10-01T05:00:00.000Z');
        expect(startOfToday(Date.parse('2026-10-01T03:00:00Z'))).toBe('2026-09-30T05:00:00.000Z');
    });
});

describe('a chat connector token on the API', () => {
    it('reads and writes what its list allows, and nothing else', async () => {
        const asClaude = await start();
        expect((await asClaude('/api/today')).status).toBe(200);
        const task = (await asClaude('/api/tasks', { method: 'POST', body: { name: 'From a chat' } })).body;
        expect((await asClaude(`/api/tasks/${task.id}`, { method: 'PATCH', body: { priority: 'now' } })).status).toBe(200);
        // areas are read-only: Claude chooses from them (docs/BLOCKS.md §3)
        expect((await asClaude('/api/areas')).status).toBe(200);
        const refused = [
            ['POST', '/api/areas'], ['PATCH', '/api/areas/1'], ['DELETE', '/api/areas/1'],
            ['DELETE', `/api/tasks/${task.id}`], ['GET', '/api/export'], ['GET', '/api/changes'], ['POST', '/api/changes/1/undo'],
            ['POST', '/api/changes/undo-since'], ['GET', '/api/connections'], ['PUT', '/api/connectors/chat'], ['GET', '/api/status'],
            ['GET', '/api/session'], ['PUT', '/api/location/kiosk'],
        ];
        for (const [method, path] of refused) {
            const res = await asClaude(path, { method, body: method === 'GET' || method === 'DELETE' ? undefined : {} });
            expect(res.status, `${method} ${path}`).toBe(403);
        }
        // the task is still there
        expect((await server.request(`/api/tasks`)).body).toHaveLength(1);
    });

    it("is recorded as Claude through its connection, whatever header it sends", async () => {
        const asClaude = await start();
        await asClaude('/api/tasks', { method: 'POST', body: { name: 'x' }, headers: { 'x-dashboard-client': 'owner' } });
        const [change] = (await server.request('/api/changes')).body;
        expect(change).toMatchObject({ actor: 'claude', via: 'claude.ai' });
        expect(change.connection_id).toEqual(expect.any(Number));
    });

    it('has its text cleaned and its links checked; the owner does not', async () => {
        const asClaude = await start();
        const rlo = String.fromCharCode(0x202E);
        const task = (await asClaude('/api/tasks', { method: 'POST', body: { name: `invoice${rlo}fdp.exe`, notes: 'one\ntwo' } })).body;
        expect(task.name).toBe('invoicefdp.exe');
        expect(task.notes).toBe('one\ntwo');
        expect((await asClaude('/api/tasks', { method: 'POST', body: { name: 'x', link: 'javascript:alert(1)' } })).status).toBe(400);
        expect((await asClaude('/api/applications', { method: 'POST', body: { company: 'A', role: 'B', url: 'http://a.example' } })).status).toBe(400);
        const owners = (await server.request('/api/tasks', { method: 'POST', body: { name: `mine${rlo}` } })).body;
        expect(owners.name).toBe(`mine${rlo}`);
    });

    it('can uncheck a habit, which deletes nothing', async () => {
        const asClaude = await start();
        const habit = (await server.request('/api/habits', { method: 'POST', body: { name: 'Read' } })).body;
        const today = new Date().toLocaleDateString('en-CA');
        expect((await asClaude(`/api/habits/${habit.id}/checks/${today}`, { method: 'PUT' })).status).toBe(200);
        expect((await asClaude(`/api/habits/${habit.id}/checks/${today}`, { method: 'DELETE' })).status).toBe(200);
        expect((await asClaude(`/api/habits/${habit.id}`, { method: 'DELETE' })).status).toBe(403);
    });

    it(`stops writing after ${WRITE_CAP} changes a day, but keeps reading`, async () => {
        const asClaude = await start();
        for (let i = 0; i < WRITE_CAP; i++) {
            expect((await asClaude('/api/tasks', { method: 'POST', body: { name: `Task ${i}` } })).status).toBe(201);
        }
        const refused = await asClaude('/api/tasks', { method: 'POST', body: { name: 'One too many' } });
        expect(refused.status).toBe(429);
        expect(refused.body.error.message).toMatch(/limit of 100/);
        expect((await asClaude('/api/tasks')).status).toBe(200);
        // the owner isn't limited
        expect((await server.request('/api/tasks', { method: 'POST', body: { name: 'Mine' } })).status).toBe(201);
        expect((await server.request('/api/connectors')).body[0]).toMatchObject({ name: 'chat', writes_today: WRITE_CAP, write_cap: WRITE_CAP });
    });
});
