// The MCP tools against the real API: an in-memory MCP connection on one side,
// a test server on the other.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createCalendarFeed } from '../server/calendar.js';
import { API_TOKEN, startServer } from '../server/testing.js';
import { createClient } from './client.js';
import { registerTools } from './tools.js';

const NOW = new Date(2026, 8, 30, 12, 0);
let server;
let client;

afterEach(async () => {
    await client?.close();
    await server?.close();
    client = server = null;
});

async function connect({ token = API_TOKEN, baseUrl } = {}) {
    server = await startServer({
        now: () => NOW.getTime(),
        calendar: createCalendarFeed({ cacheFile: new URL('../server/fixtures/calendar.ics', import.meta.url).pathname }),
    });
    const mcp = new McpServer({ name: 'dashboard', version: '1.0.0' });
    registerTools(mcp, createClient({ baseUrl: baseUrl ?? server.url, token }), () => NOW);
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    await mcp.connect(serverSide);
    client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(clientSide);
}

async function use(name, args = {}) {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content[0].text;
    return { error: Boolean(res.isError), text, value: res.isError ? null : JSON.parse(text) };
}

describe('the tool list', () => {
    it('has every tool in the design, each saying how dates are written', async () => {
        await connect();
        const { tools } = await client.listTools();
        const names = tools.map(t => t.name);
        for (const name of ['get_today', 'list_tasks', 'add_task', 'update_task', 'complete_task', 'list_areas', 'list_events', 'list_birthdays',
            'check_habit', 'increment_goal', 'achieve_goal', 'set_application_status', 'update_settings', 'delete_item']) {
            expect(names).toContain(name);
        }
        for (const tool of tools) expect(tool.description).toContain('YYYY-MM-DD');
    });

    it('marks reads as read-only and deleting as destructive', async () => {
        await connect();
        const { tools } = await client.listTools();
        const byName = Object.fromEntries(tools.map(t => [t.name, t]));
        expect(byName.list_tasks.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
        expect(byName.delete_item.annotations.destructiveHint).toBe(true);
        expect(byName.delete_item.description).toMatch(/confirm with the user/);
        expect(byName.list_events.description).toMatch(/Google Calendar connector/);
    });
});

describe('the tools', () => {
    it('add, list, complete and restore a task', async () => {
        await connect();
        const added = await use('add_task', { name: 'Buy milk' });
        expect(added.value).toMatchObject({ name: 'Buy milk', done_at: null });
        await use('complete_task', { id: added.value.id });
        expect((await use('list_tasks', { done: false })).value).toEqual([]);
        expect((await use('list_tasks', { done: true })).value[0].done_at).toBe(NOW.toISOString());
        await use('update_task', { id: added.value.id, done_at: null });
        expect((await use('list_tasks', { done: false })).value).toHaveLength(1);
    });

    it('check habits, increment goals and set application statuses', async () => {
        await connect();
        expect((await use('add_habit', { name: 'Gym', per_week: 3 })).value.per_week).toBe(3);
        const habit = (await use('add_habit', { name: 'Read' })).value;
        expect((await use('check_habit', { habit_id: habit.id, date: '2026-09-30', done: true })).value.streak).toBe(1);
        expect((await use('check_habit', { habit_id: habit.id, date: '2026-09-30', done: false })).value.streak).toBe(0);

        const goal = (await use('add_goal', { name: 'Books', target: 12 })).value;
        expect((await use('increment_goal', { id: goal.id })).value.current).toBe(1);
        expect((await use('increment_goal', { id: goal.id, by: 4 })).value.current).toBe(5);

        const app = (await use('add_application', { company: 'Stripe', role: 'Intern' })).value;
        expect(app.applied_on).toBe('2026-09-30');
        expect((await use('set_application_status', { id: app.id, status: 'oa' })).value.status).toBe('oa');
        expect((await use('update_application', { id: app.id, next_on: '2026-10-06', next_time: '14:00' })).value).toMatchObject({ next_on: '2026-10-06', next_time: '14:00' });
        expect((await use('set_application_status', { id: app.id, status: 'withdrawn' })).value.status).toBe('withdrawn');
    });

    it('read the calendar and the day', async () => {
        await connect();
        const events = (await use('list_events', { from: '2026-09-30', to: '2026-09-30' })).value;
        expect(events.map(e => e.title)).toContain('Office hours');
        expect((await use('list_birthdays', { from: '2026-09-01', to: '2026-09-30' })).value[0].title).toBe("Mom's birthday");
        expect((await use('get_today')).value.date).toBe('2026-09-30');
    });

    it('change settings and night mode', async () => {
        await connect();
        expect((await use('update_settings', { night_start: '23:00' })).value.night_start).toBe('23:00');
        expect((await use('update_settings', { week_start: 'monday' })).value.week_start).toBe('monday');
        expect((await use('start_night')).value.active).toBe(true);
        expect((await use('cancel_night')).value.active).toBe(false);
    });

    it('add a task with details, and record it as Claude', async () => {
        await connect();
        const task = (await use('add_task', { name: 'Pset 4', due: '2026-10-01', priority: 'now', minutes: 120, area: 'School', source: 'gmail:1' })).value;
        expect(task).toMatchObject({ due: '2026-10-01', priority: 'now', minutes: 120, area: 'School' });
        expect((await use('add_task', { name: 'Pset 4 again', source: 'gmail:1' })).value.id).toBe(task.id);
        const [change] = (await server.request('/api/changes')).body;
        expect(change).toMatchObject({ actor: 'claude', action: 'create' });

        // an area is chosen by name, ignoring case; an unknown one is refused with the list (docs/BLOCKS.md §3)
        expect((await use('update_task', { id: task.id, area: 'home' })).value.area).toBe('Home');
        expect((await use('update_task', { id: task.id, area: null })).value.area).toBeNull();
        const refused = await use('add_task', { name: 'Practice', area: 'Music' });
        expect(refused.text).toBe('There\'s no area called "Music". The areas are: School, Work, Job search, Home, Health, Personal, Errands. Ask the owner if none fits; only they can add one.');
        expect((await use('list_areas')).value.map(a => a.name)).toContain('Errands');
        // a recurring chore rolls forward
        const rent = (await use('add_task', { name: 'Rent', due: '2026-10-01', repeat: { every: 1, unit: 'month', day_of_month: 1 } })).value;
        expect((await use('complete_task', { id: rent.id })).value).toMatchObject({ due: '2026-11-01', done_at: null });
    });

    it('delete an item', async () => {
        await connect();
        const countdown = (await use('add_countdown', { label: 'Finals', target_date: '2026-12-10' })).value;
        expect((await use('delete_item', { resource: 'countdowns', id: countdown.id })).value).toEqual({ ok: true });
        expect((await use('list_countdowns')).value).toEqual([]);
    });
});

describe('errors', () => {
    it("pass on the API's validation messages", async () => {
        await connect();
        const res = await use('add_task', { name: 'x', due: '2026-02-30' });
        expect(res.error).toBe(true);
        expect(res.text).toMatch(/Expected a real date/);
    });

    it('report a missing item', async () => {
        await connect();
        const res = await use('complete_task', { id: 42 });
        expect(res).toMatchObject({ error: true, text: "There's no task 42" });
    });

    it('report a wrong token', async () => {
        await connect({ token: 'wrong' });
        expect((await use('list_tasks')).text).toMatch(/token/);
    });

    it("explain when the dashboard can't be reached", async () => {
        await connect({ baseUrl: 'http://127.0.0.1:9' });
        expect((await use('list_tasks')).text).toMatch(/Can't reach the dashboard.*Tailscale/);
    });
});
