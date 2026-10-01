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

describe('deadlines', () => {
    it('round-trip, with an optional course that an empty string clears', async () => {
        const { request } = await start();
        const created = await request('/api/deadlines', { method: 'POST', body: { name: 'Pset 4', due: '2026-10-01', course: 'M 340L' } });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ name: 'Pset 4', due: '2026-10-01', course: 'M 340L', done_at: null });
        const cleared = await request(`/api/deadlines/${created.body.id}`, { method: 'PATCH', body: { course: '' } });
        expect(cleared.body.course).toBeNull();
        expect((await request('/api/deadlines?done=false')).body).toHaveLength(1);
    });

    it('reject impossible dates', async () => {
        const { request } = await start();
        for (const due of ['2026-02-30', '10/01/2026', '2026-10-1']) {
            const res = await request('/api/deadlines', { method: 'POST', body: { name: 'x', due } });
            expect(res.status).toBe(400);
            expect(res.body.error.details[0].path).toBe('due');
        }
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
        expect((await request('/api/settings')).body).toEqual({ night_start: '22:00', night_end: '06:30' });
        expect((await request('/api/settings', { method: 'PATCH', body: { night_start: '23:15' } })).body.night_start).toBe('23:15');
        expect((await request('/api/settings', { method: 'PATCH', body: { night_start: '24:00' } })).status).toBe(400);
        expect((await request('/api/settings', { method: 'PATCH', body: { kiosk_location: {} } })).status).toBe(400);
    });

    it('start early until the next night end, and cancel', async () => {
        const { request } = await start();
        expect((await request('/api/night')).body).toEqual({ active: false, until: null, start: '22:00', end: '06:30' });
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
