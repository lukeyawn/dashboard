import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db.js';
import { createApplicationStore } from './applications.js';
import { createCountdownStore } from './countdowns.js';
import { createDeadlineStore } from './deadlines.js';
import { createGoalStore } from './goals.js';
import { createHabitStore, streak } from './habits.js';
import { DEFAULTS, createSettingsStore } from './settings.js';

let db;
beforeEach(() => {
    db = openDatabase();
});

describe('deadlines', () => {
    it('list by due date, open or done', () => {
        const deadlines = createDeadlineStore(db);
        deadlines.create({ name: 'later', due: '2026-10-14' });
        const soon = deadlines.create({ name: 'soon', due: '2026-10-01', course: 'M 340L' });
        deadlines.create({ name: 'same day, made later', due: '2026-10-14' });
        expect(deadlines.list().map(d => d.name)).toEqual(['soon', 'later', 'same day, made later']);
        deadlines.update(soon.id, { done_at: '2026-09-30T12:00:00.000Z' });
        expect(deadlines.list({ done: false }).map(d => d.name)).toEqual(['later', 'same day, made later']);
        expect(deadlines.list({ done: true })[0]).toMatchObject({ name: 'soon', course: 'M 340L' });
    });

    it('are rejected by the database with a malformed date', () => {
        expect(() => createDeadlineStore(db).create({ name: 'x', due: '10/14/2026' })).toThrow(/CHECK/);
    });
});

describe('countdowns', () => {
    it('send pinned as a boolean', () => {
        const countdowns = createCountdownStore(db);
        expect(countdowns.create({ label: 'Finals', target_date: '2026-12-10' }).pinned).toBe(false);
        expect(countdowns.create({ label: 'Break', target_date: '2026-11-25', pinned: true }).pinned).toBe(true);
    });

    it('keep at most one pinned', () => {
        const countdowns = createCountdownStore(db);
        const a = countdowns.create({ label: 'a', target_date: '2026-12-10', pinned: true });
        const b = countdowns.create({ label: 'b', target_date: '2026-11-25', pinned: true });
        expect(countdowns.get(a.id).pinned).toBe(false);
        countdowns.update(a.id, { pinned: true });
        expect(countdowns.get(b.id).pinned).toBe(false);
        expect(countdowns.list().filter(c => c.pinned).map(c => c.label)).toEqual(['a']);
    });

    it('leave the pinned one alone when updating one that does not exist', () => {
        const countdowns = createCountdownStore(db);
        const a = countdowns.create({ label: 'a', target_date: '2026-12-10', pinned: true });
        expect(countdowns.update(999, { pinned: true })).toBeNull();
        expect(countdowns.get(a.id).pinned).toBe(true);
    });
});

describe('goals', () => {
    it('increment, and never go below zero', () => {
        const goals = createGoalStore(db);
        const goal = goals.create({ name: 'Books', target: 12, current: 1 });
        expect(goals.increment(goal.id, 1).current).toBe(2);
        expect(goals.increment(goal.id, -5).current).toBe(0);
        expect(goals.increment(goal.id, 2.5).current).toBe(2.5);
        expect(goals.increment(999, 1)).toBeNull();
    });

    it('filter out archived ones', () => {
        const goals = createGoalStore(db);
        goals.create({ name: 'a', target: 1 });
        const b = goals.create({ name: 'b', target: 1 });
        goals.update(b.id, { archived_at: '2026-09-30T00:00:00.000Z' });
        expect(goals.list({ archived: false }).map(g => g.name)).toEqual(['a']);
    });
});

describe('applications', () => {
    it('advance applied → interview → offer, and no further', () => {
        const apps = createApplicationStore(db);
        const app = apps.create({ company: 'Stripe', role: 'Intern', status: 'applied', applied_on: '2026-09-01' });
        expect(apps.advance(app.id).status).toBe('interview');
        expect(apps.advance(app.id).status).toBe('offer');
        expect(apps.advance(app.id)).toBeUndefined();
        expect(apps.advance(999)).toBeNull();
    });

    it('never advance a rejection', () => {
        const apps = createApplicationStore(db);
        const app = apps.create({ company: 'x', role: 'y', status: 'rejected', applied_on: '2026-09-01' });
        expect(apps.advance(app.id)).toBeUndefined();
    });

    it('list the most recently updated first', () => {
        const apps = createApplicationStore(db);
        const a = apps.create({ company: 'a', role: 'r', status: 'applied', applied_on: '2026-09-01' });
        apps.create({ company: 'b', role: 'r', status: 'applied', applied_on: '2026-09-01' });
        db.prepare("UPDATE applications SET updated_at = '2030-01-01T00:00:00.000Z' WHERE id = ?").run(a.id);
        expect(apps.list().map(x => x.company)).toEqual(['a', 'b']);
        expect(apps.list({ status: 'rejected' })).toEqual([]);
    });
});

describe('habits', () => {
    const now = () => new Date(2026, 8, 30, 12, 0);

    it('count a streak ending today, or yesterday if today is not done', () => {
        expect(streak(['2026-09-30', '2026-09-29', '2026-09-28', '2026-09-26'], '2026-09-30')).toBe(3);
        expect(streak(['2026-09-29', '2026-09-28'], '2026-09-30')).toBe(2);
        expect(streak(['2026-09-28'], '2026-09-30')).toBe(0);
        expect(streak([], '2026-09-30')).toBe(0);
    });

    it('count streaks across a month end and a clock change', () => {
        expect(streak(['2026-10-01', '2026-09-30'], '2026-10-01')).toBe(2);
        expect(streak(['2026-11-02', '2026-11-01', '2026-10-31'], '2026-11-02')).toBe(3);
    });

    it('list checks in the window, oldest first, with the streak', () => {
        const habits = createHabitStore(db, { now });
        const h = habits.create({ name: 'Read' });
        for (const date of ['2026-09-20', '2026-09-24', '2026-09-29', '2026-09-30']) habits.setCheck(h.id, date, true);
        const [listed] = habits.list({ days: 7 });
        expect(listed.checks).toEqual(['2026-09-24', '2026-09-29', '2026-09-30']);
        expect(listed.streak).toBe(2);
    });

    it('make checking idempotent both ways', () => {
        const habits = createHabitStore(db, { now });
        const h = habits.create({ name: 'Read' });
        habits.setCheck(h.id, '2026-09-30', true);
        expect(habits.setCheck(h.id, '2026-09-30', true).checks).toEqual(['2026-09-30']);
        habits.setCheck(h.id, '2026-09-30', false);
        expect(habits.setCheck(h.id, '2026-09-30', false).checks).toEqual([]);
        expect(habits.setCheck(999, '2026-09-30', true)).toBeNull();
    });

    it('delete their checks with them', () => {
        const habits = createHabitStore(db, { now });
        const h = habits.create({ name: 'Read' });
        habits.setCheck(h.id, '2026-09-30', true);
        habits.remove(h.id);
        expect(db.prepare('SELECT count(*) AS n FROM habit_checks').get().n).toBe(0);
    });

    it('order by position', () => {
        const habits = createHabitStore(db, { now });
        habits.create({ name: 'b', position: 2 });
        habits.create({ name: 'a', position: 1 });
        expect(habits.list().map(h => h.name)).toEqual(['a', 'b']);
        expect(habits.withChecks(999)).toBeNull();
    });
});

describe('settings', () => {
    it('fall back to defaults, and store JSON values', () => {
        const settings = createSettingsStore(db);
        expect(settings.user()).toEqual(DEFAULTS);
        expect(settings.get('kiosk_location')).toBeNull();
        settings.set('kiosk_location', { lat: 1, lon: 2 });
        expect(settings.get('kiosk_location')).toEqual({ lat: 1, lon: 2 });
        settings.clear('kiosk_location');
        expect(settings.get('kiosk_location')).toBeNull();
    });

    it('update user settings together', () => {
        const settings = createSettingsStore(db);
        expect(settings.updateUser({ night_start: '23:00' })).toEqual({ night_start: '23:00', night_end: '06:30' });
        expect(settings.updateUser({ night_start: '21:30', night_end: '07:00' })).toEqual({ night_start: '21:30', night_end: '07:00' });
    });
});
