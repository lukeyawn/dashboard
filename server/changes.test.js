// The change record and undo (DESIGN §5.5), through the API, as the dashboard,
// /manage and Claude use them.
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createChangeLog, withActor } from './changes.js';
import { loadMigrations, migrate } from './db.js';
import { KIOSK_TOKEN, startServer } from './testing.js';

const NOW = new Date(2026, 8, 30, 12, 0).getTime();
let server;
afterEach(async () => {
    await server?.close();
    server = null;
});

async function start() {
    server = await startServer({ now: () => NOW });
    return server.request;
}

const changes = async (request, query = '') => (await request(`/api/changes${query}`)).body;
const undo = (request, id) => request(`/api/changes/${id}/undo`, { method: 'POST' });

describe('the migration to richer tasks', () => {
    it('moves every deadline into tasks, keeping its date, course and state', () => {
        const db = new Database(':memory:');
        const migrations = loadMigrations();
        migrate(db, migrations.slice(0, 7));
        db.prepare("INSERT INTO deadlines (name, due, course, done_at) VALUES ('Pset 4', '2026-10-01', 'M 340L', NULL), ('Old essay', '2026-09-01', NULL, '2026-09-01T12:00:00.000Z')").run();
        db.prepare("INSERT INTO tasks (name) VALUES ('Do laundry')").run();
        migrate(db, migrations);
        expect(db.prepare('SELECT name, due, area, done_at, priority FROM tasks ORDER BY id').all()).toEqual([
            { name: 'Do laundry', due: null, area: null, done_at: null, priority: 'normal' },
            { name: 'Pset 4', due: '2026-10-01', area: 'M 340L', done_at: null, priority: 'normal' },
            { name: 'Old essay', due: '2026-09-01', area: null, done_at: '2026-09-01T12:00:00.000Z', priority: 'normal' },
        ]);
        expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'deadlines'").get().n).toBe(0);
    });
});

describe('the change record', () => {
    it('records every write with who made it and the row before and after', async () => {
        const request = await start();
        const task = (await request('/api/tasks', { method: 'POST', body: { name: 'Buy milk' } })).body;
        await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: { priority: 'high' }, token: KIOSK_TOKEN });
        await request(`/api/tasks/${task.id}`, { method: 'DELETE', headers: { 'x-dashboard-client': 'claude' } });

        const [deleted, updated, created] = await changes(request);
        expect(created).toMatchObject({ actor: 'owner', resource: 'tasks', item_id: String(task.id), action: 'create', before: null });
        expect(created.after).toMatchObject({ name: 'Buy milk', priority: 'normal' });
        expect(updated).toMatchObject({ actor: 'kiosk', action: 'update' });
        expect([updated.before.priority, updated.after.priority]).toEqual(['normal', 'high']);
        expect(deleted).toMatchObject({ actor: 'claude', action: 'delete', after: null });
        expect(created.at).toBe(new Date(NOW).toISOString());
    });

    it('records the quick actions too: habit checks, goal +1, advancing, settings', async () => {
        const request = await start();
        const habit = (await request('/api/habits', { method: 'POST', body: { name: 'Read' } })).body;
        await request(`/api/habits/${habit.id}/checks/2026-09-30`, { method: 'PUT' });
        await request(`/api/habits/${habit.id}/checks/2026-09-30`, { method: 'PUT' }); // already checked: no change
        const goal = (await request('/api/goals', { method: 'POST', body: { name: 'Books', target: 12 } })).body;
        await request(`/api/goals/${goal.id}/increment`, { method: 'POST' });
        const app = (await request('/api/applications', { method: 'POST', body: { company: 'Stripe', role: 'Intern' } })).body;
        await request(`/api/applications/${app.id}/advance`, { method: 'POST' });
        await request('/api/settings', { method: 'PATCH', body: { night_start: '23:00' } });
        await request('/api/night/start', { method: 'POST' });

        const all = await changes(request, '?limit=200');
        const summary = all.map(c => `${c.resource}:${c.action}`).reverse();
        expect(summary).toEqual([
            'habits:create', 'habit_checks:create', 'goals:create', 'goals:update',
            'applications:create', 'applications:update', 'settings:create', 'settings:create',
        ]);
        expect(all.find(c => c.resource === 'goals' && c.action === 'update').after.current).toBe(1);
    });

    it('records unpinning other countdowns when one is pinned', async () => {
        const request = await start();
        const a = (await request('/api/countdowns', { method: 'POST', body: { label: 'a', target_date: '2026-12-01', pinned: true } })).body;
        await request('/api/countdowns', { method: 'POST', body: { label: 'b', target_date: '2026-12-02', pinned: true } });
        const unpin = (await changes(request)).find(c => c.item_id === String(a.id) && c.action === 'update');
        expect([unpin.before.pinned, unpin.after.pinned]).toEqual([1, 0]);
    });

    it('filters by actor and resource, newest first, and validates the query', async () => {
        const request = await start();
        await request('/api/tasks', { method: 'POST', body: { name: 'a' } });
        await request('/api/tasks', { method: 'POST', body: { name: 'b' }, token: KIOSK_TOKEN });
        await request('/api/goals', { method: 'POST', body: { name: 'g', target: 1 } });
        expect((await changes(request, '?actor=kiosk')).map(c => c.after.name)).toEqual(['b']);
        expect((await changes(request, '?resource=tasks&limit=1')).map(c => c.after.name)).toEqual(['b']);
        expect((await request('/api/changes?actor=hacker')).status).toBe(400);
        expect((await request('/api/changes', { token: null })).status).toBe(401);
    });
});

describe('undo', () => {
    it('puts an edited item back as it was, and records the undo', async () => {
        const request = await start();
        const task = (await request('/api/tasks', { method: 'POST', body: { name: 'Buy milk' } })).body;
        await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: { name: 'Buy oat milk', priority: 'low' } });
        const [edit] = await changes(request);
        const res = await undo(request, edit.id);
        expect(res.status).toBe(200);
        expect((await request('/api/tasks')).body[0]).toMatchObject({ name: 'Buy milk', priority: 'normal' });
        const [undone] = await changes(request);
        expect(undone).toMatchObject({ action: 'update', actor: 'owner' });

        // and an undo can be undone
        await undo(request, undone.id);
        expect((await request('/api/tasks')).body[0].name).toBe('Buy oat milk');
    });

    it('removes a created item, and restores a deleted one under its old id', async () => {
        const request = await start();
        const keep = (await request('/api/tasks', { method: 'POST', body: { name: 'Keep', area: 'home' } })).body;
        await request('/api/tasks', { method: 'POST', body: { name: 'Mistake' } });
        await undo(request, (await changes(request))[0].id);
        expect((await request('/api/tasks')).body.map(t => t.name)).toEqual(['Keep']);

        await request(`/api/tasks/${keep.id}`, { method: 'DELETE' });
        await undo(request, (await changes(request))[0].id);
        expect((await request('/api/tasks')).body).toEqual([keep]);
    });

    it('brings back a deleted habit with its history', async () => {
        const request = await start();
        const habit = (await request('/api/habits', { method: 'POST', body: { name: 'Read' } })).body;
        for (const date of ['2026-09-28', '2026-09-29']) await request(`/api/habits/${habit.id}/checks/${date}`, { method: 'PUT' });
        await request(`/api/habits/${habit.id}`, { method: 'DELETE' });
        await undo(request, (await changes(request))[0].id);
        expect((await request('/api/habits')).body[0]).toMatchObject({ name: 'Read', checks: ['2026-09-28', '2026-09-29'], streak: 2 });
    });

    it('reverses habit checks and settings', async () => {
        const request = await start();
        const habit = (await request('/api/habits', { method: 'POST', body: { name: 'Read' } })).body;
        await request(`/api/habits/${habit.id}/checks/2026-09-30`, { method: 'PUT' });
        await undo(request, (await changes(request))[0].id);
        expect((await request('/api/habits')).body[0].checks).toEqual([]);

        await request('/api/settings', { method: 'PATCH', body: { night_start: '23:00' } });
        await undo(request, (await changes(request))[0].id);
        expect((await request('/api/settings')).body.night_start).toBe('22:00');
    });

    it("refuses when the item has changed since, or is gone", async () => {
        const request = await start();
        const task = (await request('/api/tasks', { method: 'POST', body: { name: 'a' } })).body;
        await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: { name: 'b' } });
        await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: { name: 'c' } });
        const [, firstEdit] = await changes(request);
        const refused = await undo(request, firstEdit.id);
        expect(refused.status).toBe(409);
        expect(refused.body.error.message).toMatch(/changed since/);
        expect((await request('/api/tasks')).body[0].name).toBe('c');

        await request(`/api/tasks/${task.id}`, { method: 'DELETE' });
        const created = (await changes(request, '?limit=200')).find(c => c.action === 'create');
        expect((await undo(request, created.id)).status).toBe(409);
        expect((await undo(request, 9999)).status).toBe(404);
    });
});

describe('createChangeLog', () => {
    it('records outside a request as the system, and prunes entries over a year old', () => {
        const db = new Database(':memory:');
        migrate(db);
        let time = Date.parse('2027-10-01T00:00:00Z');
        const log = createChangeLog(db, { now: () => time });
        db.prepare("INSERT INTO changes (at, actor, resource, item_id, action) VALUES ('2026-09-01T00:00:00.000Z', 'owner', 'tasks', '1', 'create')").run();
        log.record({ resource: 'tasks', itemId: 2, action: 'create', after: { id: 2 } });
        withActor('agent', () => log.record({ resource: 'tasks', itemId: 3, action: 'create', after: { id: 3 } }));
        expect(log.list().map(c => [c.item_id, c.actor])).toEqual([['3', 'agent'], ['2', 'system']]);
        expect(log.get(999)).toBeNull();
    });
});
