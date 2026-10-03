// The change record and undo (DESIGN §5.5), through the API, as the dashboard,
// /manage and Claude use them.
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createChangeLog, withActor } from './changes.js';
import { loadMigrations, migrate } from './db.js';
import { createUndo } from './undo.js';
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
        migrate(db, migrations.slice(0, 8));
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
        await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: { priority: 'now' }, token: KIOSK_TOKEN });
        await request(`/api/tasks/${task.id}`, { method: 'DELETE', headers: { 'x-dashboard-client': 'claude' } });

        const [deleted, updated, created] = await changes(request);
        expect(created).toMatchObject({ actor: 'owner', resource: 'tasks', item_id: String(task.id), action: 'create', before: null });
        expect(created.after).toMatchObject({ name: 'Buy milk', priority: 'soon' });
        expect(updated).toMatchObject({ actor: 'kiosk', action: 'update' });
        expect([updated.before.priority, updated.after.priority]).toEqual(['soon', 'now']);
        expect(deleted).toMatchObject({ actor: 'claude', action: 'delete', after: null });
        expect(created.at).toBe(new Date(NOW).toISOString());
    });

    it("records the quick actions too: habit checks, goal +1, an application's stage, settings", async () => {
        const request = await start();
        const habit = (await request('/api/habits', { method: 'POST', body: { name: 'Read' } })).body;
        await request(`/api/habits/${habit.id}/checks/2026-09-30`, { method: 'PUT' });
        await request(`/api/habits/${habit.id}/checks/2026-09-30`, { method: 'PUT' }); // already checked: no change
        const goal = (await request('/api/goals', { method: 'POST', body: { name: 'Books', target: 12 } })).body;
        await request(`/api/goals/${goal.id}/increment`, { method: 'POST' });
        const app = (await request('/api/applications', { method: 'POST', body: { company: 'Stripe', role: 'Intern' } })).body;
        await request(`/api/applications/${app.id}`, { method: 'PATCH', body: { status: 'oa' } });
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
        await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: { name: 'Buy oat milk', priority: 'someday' } });
        const [edit] = await changes(request);
        const res = await undo(request, edit.id);
        expect(res.status).toBe(200);
        expect((await request('/api/tasks')).body[0]).toMatchObject({ name: 'Buy milk', priority: 'soon' });
        const [undone] = await changes(request);
        expect(undone).toMatchObject({ action: 'update', actor: 'owner' });

        // and an undo can be undone
        await undo(request, undone.id);
        expect((await request('/api/tasks')).body[0].name).toBe('Buy oat milk');
    });

    it('removes a created item, and restores a deleted one under its old id', async () => {
        const request = await start();
        const keep = (await request('/api/tasks', { method: 'POST', body: { name: 'Keep', area_id: 4, repeat: { every: 1, unit: 'week' }, due: '2026-10-04' } })).body;
        await request('/api/tasks', { method: 'POST', body: { name: 'Mistake' } });
        await undo(request, (await changes(request))[0].id);
        expect((await request('/api/tasks')).body.map(t => t.name)).toEqual(['Keep']);

        await request(`/api/tasks/${keep.id}`, { method: 'DELETE' });
        await undo(request, (await changes(request))[0].id);
        expect((await request('/api/tasks')).body).toEqual([keep]);
    });

    it('takes back a recurring task rolled forward, in one step (docs/BLOCKS.md §3)', async () => {
        const request = await start();
        const task = (await request('/api/tasks', { method: 'POST', body: { name: 'Laundry', due: '2026-09-27', repeat: { every: 1, unit: 'week' } } })).body;
        await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: { done_at: '2026-09-30T17:00:00.000Z' } });
        const [rolled] = await changes(request);
        expect([rolled.before.due, rolled.after.due]).toEqual(['2026-09-27', '2026-10-04']);
        expect((await undo(request, rolled.id)).status).toBe(200);
        expect((await request('/api/tasks')).body[0]).toMatchObject({ due: '2026-09-27', last_done_at: null, done_at: null });
    });

    it('brings a deleted area back onto the tasks it was cleared from', async () => {
        const request = await start();
        const pset = (await request('/api/tasks', { method: 'POST', body: { name: 'Pset', area_id: 1 } })).body;
        const moved = (await request('/api/tasks', { method: 'POST', body: { name: 'Essay', area_id: 1 } })).body;
        await request('/api/areas/1', { method: 'DELETE' });
        const [deleted, ...cleared] = await changes(request);
        expect(deleted.before).toMatchObject({ name: 'School', _tasks: [pset.id, moved.id] });
        expect(cleared.slice(0, 2).map(c => [c.resource, c.after.area_id])).toEqual([['tasks', null], ['tasks', null]]);

        // a cleared task can't go back on an area that's gone
        const refused = await undo(request, cleared[0].id);
        expect(refused.status).toBe(409);
        expect(refused.body.error.message).toMatch(/area has been deleted/);

        // one task gets another area meanwhile, and keeps it
        await request(`/api/tasks/${moved.id}`, { method: 'PATCH', body: { area_id: 4 } });
        expect((await undo(request, deleted.id)).status).toBe(200);
        const area = async id => (await request('/api/tasks')).body.find(t => t.id === id).area;
        expect([await area(pset.id), await area(moved.id)]).toEqual(['School', 'Home']);
        expect((await request('/api/areas')).body[0]).toMatchObject({ id: 1, name: 'School', position: 0 });
    });

    it("won't remove an added area that tasks now use", async () => {
        const request = await start();
        const music = (await request('/api/areas', { method: 'POST', body: { name: 'Music' } })).body;
        const [created] = await changes(request);
        await request('/api/tasks', { method: 'POST', body: { name: 'Practice', area_id: music.id } });
        const refused = await undo(request, created.id);
        expect(refused.status).toBe(409);
        expect(refused.body.error.message).toBe('Tasks use that area now. Delete it from Areas instead.');
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

describe('the migration to weekly habit targets (docs/BLOCKS.md §2)', () => {
    it('gives every habit 7 a week, and rewrites older changes so they can still be undone', () => {
        const db = new Database(':memory:');
        const migrations = loadMigrations();
        migrate(db, migrations.slice(0, 11));
        const log = createChangeLog(db);
        const raw = id => db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
        // as the habit store recorded changes before the migration: whole rows
        const { id } = db.prepare("INSERT INTO habits (name) VALUES ('Gym') RETURNING id").get();
        log.record({ resource: 'habits', itemId: id, action: 'create', after: raw(id) });
        const before = raw(id);
        db.prepare("UPDATE habits SET name = 'Gym!', updated_at = '2026-09-30T12:00:00.000Z' WHERE id = ?").run(id);
        log.record({ resource: 'habits', itemId: id, action: 'update', before, after: raw(id) });
        const { id: goneId } = db.prepare("INSERT INTO habits (name) VALUES ('Gone') RETURNING id").get();
        log.record({ resource: 'habits', itemId: goneId, action: 'delete', before: { ...raw(goneId), _checks: ['2026-09-29'] } });
        db.prepare('DELETE FROM habits WHERE id = ?').run(goneId);

        migrate(db, migrations);
        expect(raw(id).per_week).toBe(7);
        const [deleted, updated, created] = log.list();
        expect(Object.keys(updated.after).at(-1)).toBe('per_week');
        expect(deleted.before).toMatchObject({ _checks: ['2026-09-29'], per_week: 7 });

        // undo matches the rewritten copies, key order included
        const undo = createUndo(db, log);
        expect(undo(updated.id).name).toBe('Gym');
        expect(undo(created.id)).toBeNull();
        expect(raw(id)).toBeUndefined();
        expect(undo(deleted.id)).toMatchObject({ name: 'Gone', per_week: 7 });
    });
});

describe('the migration to countdown times (docs/BLOCKS.md §4)', () => {
    it('adds the time and detail, and rewrites older changes so they can still be undone', () => {
        const db = new Database(':memory:');
        const migrations = loadMigrations();
        migrate(db, migrations.slice(0, 12));
        const log = createChangeLog(db);
        const raw = id => db.prepare('SELECT * FROM countdowns WHERE id = ?').get(id);
        const { id } = db.prepare("INSERT INTO countdowns (label, target_date) VALUES ('Finals', '2026-12-10') RETURNING id").get();
        log.record({ resource: 'countdowns', itemId: id, action: 'create', after: raw(id) });
        const before = raw(id);
        db.prepare("UPDATE countdowns SET pinned = 1, updated_at = '2026-09-30T12:00:00.000Z' WHERE id = ?").run(id);
        log.record({ resource: 'countdowns', itemId: id, action: 'update', before, after: raw(id) });

        migrate(db, migrations);
        expect(raw(id)).toMatchObject({ target_time: null, detail: 'days' });
        const [updated, created] = log.list();
        expect(Object.keys(updated.after).slice(-2)).toEqual(['target_time', 'detail']);

        const undo = createUndo(db, log);
        expect(undo(updated.id).pinned).toBe(0);
        expect(undo(created.id)).toBeNull();
        expect(raw(id)).toBeUndefined();
    });

    it('refuses hours or live without a time', () => {
        const db = new Database(':memory:');
        migrate(db);
        expect(() => db.prepare("INSERT INTO countdowns (label, target_date, detail) VALUES ('x', '2026-12-10', 'live')").run()).toThrow(/CHECK/);
        expect(() => db.prepare("INSERT INTO countdowns (label, target_date, target_time, detail) VALUES ('x', '2026-12-10', '09:00', 'live')").run()).not.toThrow();
    });
});

describe('the migration to task areas (docs/BLOCKS.md §3)', () => {
    it('maps priorities and areas, drops effort, and rewrites older changes so they can still be undone', () => {
        const db = new Database(':memory:');
        const migrations = loadMigrations();
        migrate(db, migrations.slice(0, 13));
        const log = createChangeLog(db);
        const raw = id => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
        const { id } = db.prepare("INSERT INTO tasks (name, priority, effort, area) VALUES ('Pset', 'high', 'big', 'school') RETURNING id").get();
        log.record({ resource: 'tasks', itemId: id, action: 'create', after: raw(id) });
        const before = raw(id);
        db.prepare("UPDATE tasks SET priority = 'low', area = 'M 340L', updated_at = '2026-09-30T12:00:00.000Z' WHERE id = ?").run(id);
        log.record({ resource: 'tasks', itemId: id, action: 'update', before, after: raw(id) });

        migrate(db, migrations);
        // an area matching a seeded one by name, ignoring case, is kept; a course code isn't one
        expect(raw(id)).toMatchObject({ priority: 'someday', area_id: null, minutes: null, repeat: null });
        expect(raw(id)).not.toHaveProperty('effort');
        const [updated, created] = log.list();
        expect(created.after).toMatchObject({ priority: 'now', area_id: 1 });
        expect(Object.keys(updated.after).slice(-4)).toEqual(['area_id', 'minutes', 'repeat', 'last_done_at']);

        const undo = createUndo(db, log);
        expect(undo(updated.id)).toMatchObject({ priority: 'now', area_id: 1 });
        expect(undo(created.id)).toBeNull();
        expect(raw(id)).toBeUndefined();
    });
});

describe('createChangeLog', () => {
    it('records outside a request as the system, and keeps entries over a year old (docs/BLOCKS.md §7)', () => {
        const db = new Database(':memory:');
        migrate(db);
        const log = createChangeLog(db, { now: () => Date.parse('2027-10-01T00:00:00Z') });
        db.prepare("INSERT INTO changes (at, actor, resource, item_id, action) VALUES ('2025-09-01T00:00:00.000Z', 'owner', 'tasks', '1', 'create')").run();
        log.record({ resource: 'tasks', itemId: 2, action: 'create', after: { id: 2 } });
        withActor('agent', () => log.record({ resource: 'tasks', itemId: 3, action: 'create', after: { id: 3 } }));
        expect(log.list().map(c => [c.item_id, c.actor])).toEqual([['3', 'agent'], ['2', 'system'], ['1', 'owner']]);
        expect(log.get(999)).toBeNull();
    });
});

describe("Claude's changes (docs/CONNECTOR.md §6)", () => {
    // a server with the connector, a claude.ai chat token, and the clock at NOW
    async function startWithClaude() {
        let time = NOW;
        server = await startServer({ connector: true, now: () => time });
        const { access_token: token } = await server.signIn('chat');
        const asClaude = (path, options = {}) => server.request(path, { ...options, token });
        const asClaudeCode = (path, options = {}) => server.request(path, { ...options, headers: { 'x-dashboard-client': 'claude' } });
        return { asClaude, asClaudeCode, request: server.request, tick: ms => { time += ms; } };
    }
    const add = (as, name) => as('/api/tasks', { method: 'POST', body: { name } }).then(r => r.body);
    const names = async request => (await request('/api/tasks')).body.map(t => t.name).sort();

    it('filters by several actors, where it came from, and since when', async () => {
        const { asClaude, asClaudeCode, request, tick } = await startWithClaude();
        await add(request, 'mine');
        await add(asClaudeCode, 'from Claude Code');
        tick(60_000);
        const since = new Date(NOW + 60_000).toISOString();
        await add(asClaude, 'from claude.ai');
        const named = async query => (await changes(request, query)).map(c => c.after?.name);
        expect(await named('?actor=claude,agent')).toEqual(['from claude.ai', 'from Claude Code']);
        expect(await named('?via=claude.ai')).toEqual(['from claude.ai']);
        expect(await named('?via=claude-code')).toEqual(['from Claude Code']);
        const [{ connection_id: connection }] = await changes(request, '?via=claude.ai');
        expect(await named(`?via=${connection}`)).toEqual(['from claude.ai']);
        expect(await named(`?since=${since}`)).toEqual(['from claude.ai']);
        expect((await request('/api/changes?via=elsewhere')).status).toBe(400);
        expect((await request('/api/changes?actor=claude,robot')).status).toBe(400);
    });

    it("undoes everything since a time from claude.ai only, leaving Claude Code's work and skipping what you edited since", async () => {
        const { asClaude, asClaudeCode, request, tick } = await startWithClaude();
        const before = await add(asClaude, 'before the run');
        tick(60_000);
        const since = new Date(NOW + 60_000).toISOString();
        await add(asClaude, 'bad 1');
        const edited = await add(asClaude, 'bad but edited');
        await asClaude(`/api/tasks/${before.id}`, { method: 'PATCH', body: { priority: 'now' } });
        await add(asClaudeCode, 'good laptop work');
        await request(`/api/tasks/${edited.id}`, { method: 'PATCH', body: { name: 'kept by me' } });

        const res = await request('/api/changes/undo-since', { method: 'POST', body: { since, via: 'claude.ai' } });
        expect(res.status).toBe(200);
        expect(res.body.undone).toHaveLength(2);
        expect(res.body.skipped).toHaveLength(1);
        expect(res.body.skipped[0].change.after.name).toBe('bad but edited');
        expect(res.body.skipped[0].reason).toMatch(/changed since/);
        expect(await names(request)).toEqual(['before the run', 'good laptop work', 'kept by me']);
        expect((await request('/api/tasks')).body.find(t => t.id === before.id).priority).toBe('soon');
        // the undo is the owner's, and can itself be undone
        const [latest] = await changes(request);
        expect(latest.actor).toBe('owner');
    });

    it('undoes Claude Code too when widened, and validates the request', async () => {
        const { asClaude, asClaudeCode, request } = await startWithClaude();
        await add(asClaude, 'a');
        await add(asClaudeCode, 'b');
        await add(request, 'mine');
        const res = await request('/api/changes/undo-since', { method: 'POST', body: { since: new Date(NOW - 1000).toISOString() } });
        expect(res.body.undone).toHaveLength(2);
        expect(await names(request)).toEqual(['mine']);
        expect((await request('/api/changes/undo-since', { method: 'POST', body: {} })).status).toBe(400);
        expect((await request('/api/changes/undo-since', { method: 'POST', body: { since: 'yesterday' } })).status).toBe(400);
    });

    it("marks rows Claude created, and not a later row that reuses an undone row's id", async () => {
        const { asClaude, asClaudeCode, request, tick } = await startWithClaude();
        const mine = await add(request, 'mine');
        const fromChat = await add(asClaude, 'from a chat');
        const fromLaptop = await add(asClaudeCode, 'from Claude Code');
        const byId = async () => Object.fromEntries((await request('/api/tasks')).body.map(t => [t.id, t.claude_change ?? null]));
        let marks = await byId();
        expect(marks[mine.id]).toBeNull();
        expect(marks[fromChat.id]).toMatchObject({ actor: 'claude', via: 'claude.ai' });
        expect(marks[fromLaptop.id]).toMatchObject({ actor: 'claude', via: 'claude-code' });

        // undo the newest (its id is the highest), then the owner adds one that takes the id
        await request(`/api/changes/${marks[fromLaptop.id].id}/undo`, { method: 'POST' });
        tick(1000);
        const reused = await add(request, 'mine, same id');
        expect(reused.id).toBe(fromLaptop.id);
        marks = await byId();
        expect(marks[reused.id]).toBeNull();
    });

    it('drops the mark a year after Claude created the item, and keeps the change (docs/BLOCKS.md §7)', async () => {
        const { asClaude, request, tick } = await startWithClaude();
        const task = await add(asClaude, 'from a chat');
        const mark = async () => (await request('/api/tasks')).body.find(t => t.id === task.id).claude_change ?? null;
        tick(364 * 24 * 60 * 60 * 1000);
        expect(await mark()).toMatchObject({ actor: 'claude' });

        tick(2 * 24 * 60 * 60 * 1000);
        expect(await mark()).toBeNull();
        expect((await changes(request, '?resource=tasks')).map(c => [c.item_id, c.action])).toEqual([[String(task.id), 'create']]);
    });
});

describe('the migration to the assignments area (docs/BLOCKS.md §3)', () => {
    const setting = db => db.prepare("SELECT value FROM settings WHERE key = 'assignments_area'").get()?.value ?? null;

    it("stores School's id, so renaming School later doesn't move the tile", () => {
        const db = new Database(':memory:');
        const migrations = loadMigrations();
        migrate(db, migrations.slice(0, 14));
        db.prepare("UPDATE areas SET name = 'school' WHERE name = 'School'").run();
        migrate(db, migrations);
        expect(JSON.parse(setting(db))).toBe(db.prepare("SELECT id FROM areas WHERE name = 'school'").get().id);
    });

    it('stores nothing without a School', () => {
        const db = new Database(':memory:');
        const migrations = loadMigrations();
        migrate(db, migrations.slice(0, 14));
        db.prepare("DELETE FROM areas WHERE name = 'School'").run();
        migrate(db, migrations);
        expect(setting(db)).toBeNull();
    });
});

// how much a goal went up this week, from its recorded changes (docs/BLOCKS.md §5)
describe("a goal's progress this week", () => {
    it('sums every change to current since the week started, with Undo taking back what it undoes', async () => {
        let at = new Date(2026, 8, 26, 12).getTime(); // Saturday, Sep 26
        server = await startServer({ now: () => at });
        const { request } = server;
        const goal = (await request('/api/goals', { method: 'POST', body: { name: 'Pages', target: 500, step: 10 } })).body;
        const add = () => request(`/api/goals/${goal.id}/increment`, { method: 'POST' });
        await add(); // last week, on either week_start
        at = new Date(2026, 8, 27, 12).getTime(); // Sunday
        await add();
        at = new Date(2026, 8, 30, 12).getTime(); // Wednesday
        await add();
        await request(`/api/goals/${goal.id}`, { method: 'PATCH', body: { current: 45 } });
        expect((await request('/api/goals')).body[0].week_gain).toBe(35);
        await request('/api/settings', { method: 'PATCH', body: { week_start: 'monday' } });
        expect((await request('/api/goals')).body[0].week_gain).toBe(25);

        const [latest] = await changes(request, '?resource=goals');
        await undo(request, latest.id);
        expect((await request('/api/goals')).body[0]).toMatchObject({ current: 30, week_gain: 10 });
    });

    it("doesn't count a deleted goal's progress for one that reuses its id", async () => {
        server = await startServer({ now: () => NOW });
        const { request } = server;
        const old = (await request('/api/goals', { method: 'POST', body: { name: 'Old', target: 5 } })).body;
        await request(`/api/goals/${old.id}/increment`, { method: 'POST', body: { by: 3 } });
        await request(`/api/goals/${old.id}`, { method: 'DELETE' });
        await new Promise(resolve => setTimeout(resolve, 5));
        const reused = (await request('/api/goals', { method: 'POST', body: { name: 'New', target: 5 } })).body;
        expect(reused.id).toBe(old.id);
        expect(reused.week_gain).toBe(0);
    });
});

describe("a milestone's Done (docs/BLOCKS.md §5)", () => {
    it('is undone in one step, back to open', async () => {
        const request = await start();
        const offer = (await request('/api/goals', { method: 'POST', body: { name: 'Offer', kind: 'milestone' } })).body;
        await request(`/api/goals/${offer.id}/achieve`, { method: 'POST' });
        const [done] = await changes(request, '?resource=goals');
        expect((await undo(request, done.id)).status).toBe(200);
        expect((await request('/api/goals')).body[0]).toMatchObject({ achieved_at: null, archived_at: null });
    });
});

describe('the migration to goal kinds (docs/BLOCKS.md §5)', () => {
    it('keeps every goal as progress, started the day it was made, and rewrites older changes so they can still be undone', () => {
        const db = new Database(':memory:');
        const migrations = loadMigrations();
        migrate(db, migrations.slice(0, 15));
        const log = createChangeLog(db);
        const raw = id => db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
        const { id } = db.prepare("INSERT INTO goals (name, target, created_at) VALUES ('Books', 12, '2026-09-30T03:00:00.000Z') RETURNING id").get();
        log.record({ resource: 'goals', itemId: id, action: 'create', after: raw(id) });
        const before = raw(id);
        db.prepare("UPDATE goals SET current = 2, updated_at = '2026-09-30T12:00:00.000Z' WHERE id = ?").run(id);
        log.record({ resource: 'goals', itemId: id, action: 'update', before, after: raw(id) });

        migrate(db, migrations);
        // 3 AM UTC is the evening before in Chicago, where the tests run
        expect(raw(id)).toMatchObject({ kind: 'progress', started: '2026-09-29', step: 1, deadline: null, achieved_at: null, dream: 0 });
        const [updated, created] = log.list();
        expect(Object.keys(updated.after).slice(-6)).toEqual(['kind', 'deadline', 'started', 'step', 'achieved_at', 'dream']);

        const undoChange = createUndo(db, log);
        expect(undoChange(updated.id).current).toBe(0);
        expect(undoChange(created.id)).toBeNull();
        expect(raw(id)).toBeUndefined();
    });

    it('refuses a milestone with a count, and a progress goal without a target', () => {
        const db = new Database(':memory:');
        migrate(db);
        expect(() => db.prepare("INSERT INTO goals (name, kind, current, target, step, started) VALUES ('x', 'milestone', NULL, 3, NULL, '2026-09-30')").run()).toThrow(/CHECK/);
        expect(() => db.prepare("INSERT INTO goals (name, target, started) VALUES ('x', NULL, '2026-09-30')").run()).toThrow(/CHECK/);
        expect(() => db.prepare("INSERT INTO goals (name, kind, current, step, started) VALUES ('x', 'milestone', NULL, NULL, '2026-09-30')").run()).not.toThrow();
    });
});

describe('the migration to application steps (docs/BLOCKS.md §6)', () => {
    it('keeps every application, with no next step, and rewrites older changes so they can still be undone', () => {
        const db = new Database(':memory:');
        const migrations = loadMigrations();
        migrate(db, migrations.slice(0, 16));
        const log = createChangeLog(db);
        const raw = id => db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
        const { id } = db.prepare("INSERT INTO applications (company, role, applied_on, source) VALUES ('Stripe', 'Intern', '2026-09-01', 'gmail:1') RETURNING id").get();
        log.record({ resource: 'applications', itemId: id, action: 'create', after: raw(id) });
        const before = raw(id);
        db.prepare("UPDATE applications SET status = 'interview', updated_at = '2026-09-30T12:00:00.000Z' WHERE id = ?").run(id);
        log.record({ resource: 'applications', itemId: id, action: 'update', before, after: raw(id) });

        migrate(db, migrations);
        expect(raw(id)).toMatchObject({ status: 'interview', source: 'gmail:1', next_on: null, next_time: null });
        const [updated, created] = log.list();
        expect(Object.keys(updated.after).slice(-3)).toEqual(['source', 'next_on', 'next_time']);

        const undoChange = createUndo(db, log);
        expect(undoChange(updated.id).status).toBe('applied');
        expect(undoChange(created.id)).toBeNull();
        expect(raw(id)).toBeUndefined();
    });

    it('takes oa and withdrawn, keeps source unique, and refuses a time without a date', () => {
        const db = new Database(':memory:');
        migrate(db);
        const insert = (values, extra = '') => db.prepare(`INSERT INTO applications (company, role, applied_on, status, source, next_on, next_time) VALUES ('a', 'r', '2026-09-01', ${values})${extra}`).run();
        expect(() => insert("'oa', 'x', '2026-10-06', '14:00'")).not.toThrow();
        expect(() => insert("'withdrawn', NULL, NULL, NULL")).not.toThrow();
        expect(() => insert("'ghosted', NULL, NULL, NULL")).toThrow(/CHECK/);
        expect(() => insert("'oa', NULL, NULL, '14:00'")).toThrow(/CHECK/);
        expect(() => insert("'oa', 'x', NULL, NULL")).toThrow(/UNIQUE/);
    });
});

describe('the migration to a to-apply list (docs/BLOCKS.md §6)', () => {
    it('keeps every application and its older changes undoable, from a database that already ran 017', () => {
        const db = new Database(':memory:');
        const migrations = loadMigrations();
        migrate(db, migrations.slice(0, 17));
        const log = createChangeLog(db);
        const raw = id => db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
        const { id } = db.prepare("INSERT INTO applications (company, role, applied_on, status, next_on) VALUES ('Ramp', 'Intern', '2026-09-01', 'oa', '2026-10-02') RETURNING id").get();
        log.record({ resource: 'applications', itemId: id, action: 'create', after: raw(id) });
        const before = raw(id);
        db.prepare("UPDATE applications SET status = 'interview', next_on = NULL, updated_at = '2026-09-30T12:00:00.000Z' WHERE id = ?").run(id);
        log.record({ resource: 'applications', itemId: id, action: 'update', before, after: raw(id) });

        migrate(db, migrations);
        expect(db.pragma('user_version', { simple: true })).toBe(18);
        expect(raw(id)).toMatchObject({ status: 'interview', applied_on: '2026-09-01' });
        const [updated] = log.list();
        expect(createUndo(db, log)(updated.id)).toMatchObject({ status: 'oa', next_on: '2026-10-02' });
    });

    it('takes to_apply without a date applied, and nothing else without one', () => {
        const db = new Database(':memory:');
        migrate(db);
        expect(() => db.prepare("INSERT INTO applications (company, role, status, applied_on) VALUES ('a', 'r', 'to_apply', NULL)").run()).not.toThrow();
        expect(() => db.prepare("INSERT INTO applications (company, role, status, applied_on) VALUES ('a', 'r', 'applied', NULL)").run()).toThrow(/CHECK/);
    });

});

describe('who wrote a link (docs/AGENT.md §2)', () => {
    async function startWithClaude() {
        server = await startServer({ connector: true, now: () => NOW });
        const { access_token: token } = await server.signIn('chat');
        const asClaude = (path, options = {}) => server.request(path, { ...options, token });
        return { asClaude, request: server.request };
    }
    const byClaude = async (request, id) => (await request('/api/applications')).body.find(a => a.id === id).url_by_claude;

    it("marks a link Claude wrote, and not one you wrote or Claude's edits to anything else", async () => {
        const { asClaude, request } = await startWithClaude();
        const claudes = (await asClaude('/api/applications', { method: 'POST', body: { company: 'A', role: 'R', url: 'https://evil.example/' } })).body;
        const mine = (await request('/api/applications', { method: 'POST', body: { company: 'B', role: 'R', url: 'https://stripe.com/jobs' } })).body;
        expect(claudes.url_by_claude).toBe(true);
        expect(await byClaude(request, claudes.id)).toBe(true);
        await asClaude(`/api/applications/${mine.id}`, { method: 'PATCH', body: { notes: 'Recruiter: Dana' } });
        expect(await byClaude(request, mine.id)).toBe(false);

        // your new link is yours; Claude's change to it is Claude's
        await request(`/api/applications/${claudes.id}`, { method: 'PATCH', body: { url: 'https://ramp.com/careers' } });
        expect(await byClaude(request, claudes.id)).toBe(false);
        const changed = (await asClaude(`/api/applications/${mine.id}`, { method: 'PATCH', body: { url: 'https://stripe.com.evil.example/' } })).body;
        expect(changed.url_by_claude).toBe(true);
    });

    it("still marks Claude's link after you undo a later change back to it", async () => {
        const { asClaude, request } = await startWithClaude();
        const app = (await asClaude('/api/applications', { method: 'POST', body: { company: 'A', role: 'R', url: 'https://evil.example/' } })).body;
        await request(`/api/applications/${app.id}`, { method: 'PATCH', body: { url: 'https://ramp.com/careers' } });
        const [latest] = await changes(request);
        await undo(request, latest.id);
        expect(await byClaude(request, app.id)).toBe(true);
    });
});
