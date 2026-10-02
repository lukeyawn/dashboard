// The API for everything besides tasks and login, which app.test.js covers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCalendarFeed } from './calendar.js';
import { KIOSK_TOKEN, startServer } from './testing.js';

// noon on Wednesday 2026-09-30, in the tests' America/Chicago
const NOW = new Date(2026, 8, 30, 12, 0).getTime();

let server;
afterEach(async () => {
    await server?.close();
    server = null;
});

async function start(options = {}) {
    server = await startServer({ now: () => NOW, ...options });
    return server;
}

describe('tasks with details', () => {
    it('take an optional due date, priority, effort, area, notes and link', async () => {
        const { request } = await start();
        const created = await request('/api/tasks', { method: 'POST', body: {
            name: 'Pset 4', due: '2026-10-01', priority: 'high', effort: 'big', area: 'M 340L', notes: 'Problems 1-6', link: 'https://canvas.example/a/4',
        } });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ due: '2026-10-01', priority: 'high', effort: 'big', area: 'M 340L', source: null });
        const plain = (await request('/api/tasks', { method: 'POST', body: { name: 'Buy milk' } })).body;
        expect(plain).toMatchObject({ due: null, priority: 'normal', effort: null, area: null });
        const cleared = await request(`/api/tasks/${created.body.id}`, { method: 'PATCH', body: { area: '', due: null } });
        expect(cleared.body).toMatchObject({ area: null, due: null });
    });

    it('reject impossible dates and unknown priorities', async () => {
        const { request } = await start();
        for (const body of [{ name: 'x', due: '2026-02-30' }, { name: 'x', priority: 'urgent' }, { name: 'x', effort: 'tiny' }]) {
            expect((await request('/api/tasks', { method: 'POST', body })).status).toBe(400);
        }
    });

    it('never create a second item from the same source', async () => {
        const { request } = await start();
        const body = { name: 'Reply to recruiter', source: 'gmail:18c2f0' };
        const first = await request('/api/tasks', { method: 'POST', body });
        const again = await request('/api/tasks', { method: 'POST', body: { ...body, name: 'Different wording' } });
        expect(first.status).toBe(201);
        expect(again.status).toBe(200);
        expect(again.body).toEqual(first.body);
        expect((await request('/api/tasks')).body).toHaveLength(1);
        const app = { company: 'Stripe', role: 'Intern', source: 'gmail:abc' };
        await request('/api/applications', { method: 'POST', body: app });
        expect((await request('/api/applications', { method: 'POST', body: app })).status).toBe(200);
    });
});

describe('countdowns', () => {
    it('keep one pinned, sent as a boolean', async () => {
        const { request } = await start();
        await request('/api/countdowns', { method: 'POST', body: { label: 'Finals', target_date: '2026-12-10', pinned: true } });
        await request('/api/countdowns', { method: 'POST', body: { label: 'Break', target_date: '2026-11-25', pinned: true } });
        const list = (await request('/api/countdowns')).body;
        expect(list.map(c => [c.label, c.pinned])).toEqual([['Break', true], ['Finals', false]]);
    });

    it('reject a non-boolean pinned', async () => {
        const { request } = await start();
        const res = await request('/api/countdowns', { method: 'POST', body: { label: 'x', target_date: '2026-12-10', pinned: 1 } });
        expect(res.status).toBe(400);
    });

    // docs/BLOCKS.md §4
    const post = (request, body) => request('/api/countdowns', { method: 'POST', body });

    it('refuse a date or time that has passed, saying so, and allow today', async () => {
        const { request } = await start();
        const refused = await post(request, { label: 'New Years!', target_date: '2026-01-01' });
        expect(refused.status).toBe(400);
        expect(refused.body.error.message).toBe('That date has passed (Jan 1, 2026). Did you mean 2027?');
        expect((await post(request, { label: 'Lunch', target_date: '2026-09-30', target_time: '11:30' })).body.error.message).toBe('That time has passed (11:30 AM today).');
        expect((await post(request, { label: 'Dinner', target_date: '2026-09-30', target_time: '19:00' })).status).toBe(201);
        expect((await post(request, { label: 'Today', target_date: '2026-09-30' })).status).toBe(201);
    });

    it('need a time for hours and live, on a new countdown and an edit', async () => {
        const { request } = await start();
        expect((await post(request, { label: 'Flight', target_date: '2026-10-02', detail: 'live' })).status).toBe(400);
        const flight = (await post(request, { label: 'Flight', target_date: '2026-10-02', target_time: '14:00', detail: 'live' })).body;
        expect(flight).toMatchObject({ target_time: '14:00', detail: 'live' });
        const cleared = await request(`/api/countdowns/${flight.id}`, { method: 'PATCH', body: { target_time: null } });
        expect(cleared.body.error.message).toBe('Hours and live need a time.');
        expect((await post(request, { label: 'Finals', target_date: '2026-12-10' })).body.detail).toBe('days');
    });

    it('list only current ones, past ones with past=true, and let a past one be renamed but not moved to the past', async () => {
        let time = NOW;
        server = await startServer({ now: () => time });
        const { request } = server;
        const today = (await post(request, { label: 'Today', target_date: '2026-09-30', target_time: '13:00' })).body;
        await post(request, { label: 'Tomorrow', target_date: '2026-10-01' });
        const names = async query => (await request(`/api/countdowns${query}`)).body.map(c => c.label);
        // still current after its time, through the end of its day
        time = new Date(2026, 8, 30, 23, 59).getTime();
        expect(await names('')).toEqual(['Today', 'Tomorrow']);
        time = new Date(2026, 9, 1, 0, 0).getTime();
        expect(await names('')).toEqual(['Tomorrow']);
        expect(await names('?past=true')).toEqual(['Today']);

        expect((await request(`/api/countdowns/${today.id}`, { method: 'PATCH', body: { label: 'Yesterday' } })).status).toBe(200);
        const moved = await request(`/api/countdowns/${today.id}`, { method: 'PATCH', body: { target_date: '2026-09-29' } });
        expect(moved.status).toBe(400);
        expect(moved.body.error.message).toMatch(/^That date has passed \(Sep 29, 2026\)/);
        expect((await request(`/api/countdowns/${today.id}`, { method: 'PATCH', body: { target_date: '2026-10-05' } })).status).toBe(200);
        expect((await request('/api/countdowns/999', { method: 'PATCH', body: { target_date: '2026-01-01' } })).status).toBe(404);
    });
});

describe('goals', () => {
    it('increment by 1 by default, or by any non-zero amount', async () => {
        const { request } = await start();
        const goal = (await request('/api/goals', { method: 'POST', body: { name: 'Books', target: 12 } })).body;
        expect(goal).toMatchObject({ current: 0, target: 12, unit: null, archived_at: null });
        expect((await request(`/api/goals/${goal.id}/increment`, { method: 'POST' })).body.current).toBe(1);
        expect((await request(`/api/goals/${goal.id}/increment`, { method: 'POST', body: { by: 5 } })).body.current).toBe(6);
        expect((await request(`/api/goals/${goal.id}/increment`, { method: 'POST', body: { by: -1 } })).body.current).toBe(5);
        expect((await request(`/api/goals/${goal.id}/increment`, { method: 'POST', body: { by: 0 } })).status).toBe(400);
        expect((await request('/api/goals/99/increment', { method: 'POST' })).status).toBe(404);
    });

    it('need a positive target', async () => {
        const { request } = await start();
        expect((await request('/api/goals', { method: 'POST', body: { name: 'x', target: 0 } })).status).toBe(400);
    });
});

describe('habits', () => {
    it('list each habit with its checks in the window and its streak', async () => {
        const { request } = await start();
        const habit = (await request('/api/habits', { method: 'POST', body: { name: 'Read' } })).body;
        for (const date of ['2026-09-28', '2026-09-29']) {
            expect((await request(`/api/habits/${habit.id}/checks/${date}`, { method: 'PUT' })).status).toBe(200);
        }
        const [listed] = (await request('/api/habits?days=7&archived=false')).body;
        expect(listed).toMatchObject({ name: 'Read', checks: ['2026-09-28', '2026-09-29'], streak: 2 });
    });

    it('check and uncheck idempotently, returning the habit', async () => {
        const { request } = await start();
        const habit = (await request('/api/habits', { method: 'POST', body: { name: 'Read' } })).body;
        const path = `/api/habits/${habit.id}/checks/2026-09-30`;
        await request(path, { method: 'PUT' });
        const again = await request(path, { method: 'PUT' });
        expect(again.body).toMatchObject({ checks: ['2026-09-30'], streak: 1 });
        await request(path, { method: 'DELETE' });
        expect((await request(path, { method: 'DELETE' })).body).toMatchObject({ checks: [], streak: 0 });
    });

    it('refuse future days, bad dates and unknown habits', async () => {
        const { request } = await start();
        const habit = (await request('/api/habits', { method: 'POST', body: { name: 'Read' } })).body;
        expect((await request(`/api/habits/${habit.id}/checks/2026-10-01`, { method: 'PUT' })).status).toBe(400);
        expect((await request(`/api/habits/${habit.id}/checks/2026-10-01`, { method: 'DELETE' })).status).toBe(200);
        expect((await request(`/api/habits/${habit.id}/checks/yesterday`, { method: 'PUT' })).status).toBe(400);
        expect((await request('/api/habits/99/checks/2026-09-30', { method: 'PUT' })).status).toBe(404);
    });
});

describe('applications', () => {
    it('default to applied today, and advance to an offer', async () => {
        const { request } = await start();
        const app = (await request('/api/applications', { method: 'POST', body: { company: 'Stripe', role: 'Backend Intern' } })).body;
        expect(app).toMatchObject({ status: 'applied', applied_on: '2026-09-30', url: null, notes: null });
        expect((await request(`/api/applications/${app.id}/advance`, { method: 'POST' })).body.status).toBe('interview');
        expect((await request(`/api/applications/${app.id}/advance`, { method: 'POST' })).body.status).toBe('offer');
        const stuck = await request(`/api/applications/${app.id}/advance`, { method: 'POST' });
        expect(stuck.status).toBe(409);
        expect((await request('/api/applications/99/advance', { method: 'POST' })).status).toBe(404);
    });

    it('filter by status, and reject unknown ones', async () => {
        const { request } = await start();
        await request('/api/applications', { method: 'POST', body: { company: 'a', role: 'r', status: 'rejected' } });
        expect((await request('/api/applications?status=rejected')).body).toHaveLength(1);
        expect((await request('/api/applications?status=applied')).body).toHaveLength(0);
        expect((await request('/api/applications', { method: 'POST', body: { company: 'a', role: 'r', status: 'ghosted' } })).status).toBe(400);
    });
});

describe('settings and night mode', () => {
    it('show defaults, and accept only valid times for the user keys', async () => {
        const { request } = await start();
        expect((await request('/api/settings')).body).toEqual({ night_start: '22:00', night_end: '06:30', week_start: 'sunday' });
        expect((await request('/api/settings', { method: 'PATCH', body: { week_start: 'monday' } })).body.week_start).toBe('monday');
        expect((await request('/api/settings', { method: 'PATCH', body: { week_start: 'friday' } })).status).toBe(400);
        expect((await request('/api/settings', { method: 'PATCH', body: { night_start: '23:15' } })).body.night_start).toBe('23:15');
        expect((await request('/api/settings', { method: 'PATCH', body: { night_start: '24:00' } })).status).toBe(400);
        expect((await request('/api/settings', { method: 'PATCH', body: { kiosk_location: {} } })).status).toBe(400);
    });

    it('start early until the next night end, and cancel', async () => {
        const { request } = await start();
        expect((await request('/api/night')).body).toEqual({ active: false, early: false, until: null, start: '22:00', end: '06:30' });
        const started = (await request('/api/night/start', { method: 'POST' })).body;
        expect(started).toMatchObject({ active: true, until: new Date(2026, 9, 1, 6, 30).toISOString() });
        expect((await request('/api/night')).body.active).toBe(true);
        expect((await request('/api/night/cancel', { method: 'POST' })).body.active).toBe(false);
    });
});

describe('weather and location', () => {
    const weatherAt = vi.fn(async () => ({ temperature: 82, condition: 'Clear', high: 92, low: 70, unit: 'F' }));

    it("uses Austin until the kiosk reports, then the kiosk's location", async () => {
        const { request } = await start({ weatherAt });
        const before = (await request('/api/weather')).body;
        expect(before).toMatchObject({ location: { name: 'Austin, TX', source: 'default' }, temperature: 82, report_location: false });

        expect((await request('/api/location/kiosk', { method: 'PUT', body: { lat: 47.61, lon: -122.33, name: 'Seattle, WA' } })).status).toBe(403);
        const reported = await request('/api/location/kiosk', { method: 'PUT', token: KIOSK_TOKEN, body: { lat: 47.61, lon: -122.33, name: 'Seattle, WA' } });
        expect(reported.body).toMatchObject({ name: 'Seattle, WA', reported_at: new Date(NOW).toISOString() });
        expect((await request('/api/weather')).body.location).toEqual({ lat: 47.61, lon: -122.33, name: 'Seattle, WA', source: 'kiosk' });
    });

    it("uses the device's location when it sends one", async () => {
        const { request } = await start({ weatherAt });
        const res = await request('/api/weather?lat=40.71&lon=-74.01');
        expect(res.body.location).toEqual({ lat: 40.71, lon: -74.01, name: null, source: 'device' });
        expect(weatherAt).toHaveBeenLastCalledWith(expect.objectContaining({ lat: 40.71, lon: -74.01 }));
        expect((await request('/api/weather?lat=40.71')).status).toBe(400);
    });

    it('asks only the kiosk to report, and only when its report is old', async () => {
        const { request } = await start({ weatherAt });
        expect((await request('/api/weather', { token: KIOSK_TOKEN })).body.report_location).toBe(true);
        await request('/api/location/kiosk', { method: 'PUT', token: KIOSK_TOKEN, body: { lat: 1, lon: 2 } });
        expect((await request('/api/weather', { token: KIOSK_TOKEN })).body.report_location).toBe(false);
    });

    it('answers 502 when there is no weather to give', async () => {
        const { request } = await start({ weatherAt: async () => { throw new Error('offline'); } });
        const res = await request('/api/weather');
        expect(res.status).toBe(502);
        expect(res.body.error.message).toContain('offline');
    });
});

describe('events and birthdays', () => {
    const calendar = createCalendarFeed({ cacheFile: new URL('./fixtures/calendar.ics', import.meta.url).pathname });

    it('come from the calendar feed for the dates asked', async () => {
        const { request } = await start({ calendar });
        const events = (await request('/api/events?from=2026-09-30&to=2026-09-30')).body;
        expect(events.map(e => e.title)).toEqual(['Algorithms lecture (moved)', 'Office hours']);
        const birthdays = (await request('/api/birthdays?from=2026-09-30&to=2026-10-07')).body;
        expect(birthdays.map(b => b.title)).toEqual(["Mom's birthday"]);
    });

    it('need a valid range of at most a year', async () => {
        const { request } = await start({ calendar });
        expect((await request('/api/events?from=2026-10-01&to=2026-09-30')).status).toBe(400);
        expect((await request('/api/events?from=2026-01-01&to=2027-06-01')).status).toBe(400);
        expect((await request('/api/events?from=2026-09-30')).status).toBe(400);
    });

    it('are empty when no calendar is set up', async () => {
        const { request } = await start();
        expect((await request('/api/events?from=2026-09-30&to=2026-09-30')).body).toEqual([]);
    });
});


describe('export', () => {
    it('downloads every table as one JSON document', async () => {
        const { request } = await start();
        await request('/api/tasks', { method: 'POST', body: { name: 'Do laundry' } });
        const res = await request('/api/export');
        expect(res.headers.get('content-disposition')).toContain('dashboard-export-');
        expect(res.body.tables.tasks.map(t => t.name)).toEqual(['Do laundry']);
        expect(res.body.exported_at).toBe(new Date(NOW).toISOString());
    });

    it('needs a token like everything else', async () => {
        const { request } = await start();
        expect((await request('/api/export', { token: null })).status).toBe(401);
    });
});

describe('today', () => {
    const calendar = createCalendarFeed({ cacheFile: new URL('./fixtures/calendar.ics', import.meta.url).pathname });
    const weatherAt = async () => ({ temperature: 82, condition: 'Clear', high: 92, low: 70, unit: 'F' });

    it('gathers the day for the agent', async () => {
        const { request } = await start({ calendar, weatherAt });
        await request('/api/tasks', { method: 'POST', body: { name: 'Do laundry' } });
        await request('/api/tasks', { method: 'POST', body: { name: 'Overdue', due: '2026-09-29' } });
        await request('/api/tasks', { method: 'POST', body: { name: 'Soon', due: '2026-10-05' } });
        await request('/api/tasks', { method: 'POST', body: { name: 'Far off', due: '2026-12-01', priority: 'high' } });
        await request('/api/countdowns', { method: 'POST', body: { label: 'Break', target_date: '2026-11-25' } });
        await request('/api/countdowns', { method: 'POST', body: { label: 'Flight', target_date: '2026-10-02', target_time: '14:00', detail: 'hours' } });
        await request('/api/countdowns', { method: 'POST', body: { label: 'Out of class', target_date: '2026-10-02' } });
        const habit = (await request('/api/habits', { method: 'POST', body: { name: 'Read' } })).body;
        await request(`/api/habits/${habit.id}/checks/2026-09-30`, { method: 'PUT' });
        await request('/api/applications', { method: 'POST', body: { company: 'Stripe', role: 'Intern' } });

        const { body } = await request('/api/today');
        expect(body.date).toBe('2026-09-30');
        expect(body.events.map(e => e.title)).toEqual(['Algorithms lecture (moved)', 'Office hours']);
        expect(body.birthdays_this_week.map(b => b.title)).toEqual(["Mom's birthday"]);
        expect(body.due_soon.map(t => [t.name, t.days_left])).toEqual([['Overdue', -1], ['Soon', 5]]);
        expect(body.tasks.map(t => t.name)).toEqual(['Far off', 'Do laundry']);
        expect(body.habits).toEqual([expect.objectContaining({ name: 'Read', done_today: true, streak: 1 })]);
        // nearest first, one without a time before one with a time on the same day
        expect(body.countdowns.map(c => [c.label, c.days_left])).toEqual([['Out of class', 2], ['Flight', 2], ['Break', 56]]);
        expect(body.countdowns[1]).toMatchObject({ target_time: '14:00', detail: 'hours' });
        expect(body.applications.counts).toEqual({ applied: 1, interview: 0, offer: 0, rejected: 0 });
        expect(body.weather).toMatchObject({ temperature: 82, location: { source: 'default' } });
        expect(body.night.active).toBe(false);
    });

    it('still answers when the weather fails', async () => {
        const { request } = await start({ weatherAt: async () => { throw new Error('offline'); } });
        const { status, body } = await request('/api/today');
        expect(status).toBe(200);
        expect(body.weather).toBeNull();
    });
});

describe('status', () => {
    it('reports the backup and calendar, and needs a token', async () => {
        const { request } = await start();
        expect((await request('/api/status', { token: null })).status).toBe(401);
        expect((await request('/api/status')).body).toEqual({ backup: null, calendar: null, connectors: [], problems: [] });
    });
});
