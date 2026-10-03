import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db.js';
import { createApplicationStore } from './applications.js';
import { createCountdownStore } from './countdowns.js';
import { createGoalStore } from './goals.js';
import { createHabitStore, streak } from './habits.js';
import { DEFAULTS, createSettingsStore } from './settings.js';

let db;
beforeEach(() => {
    db = openDatabase();
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
    it('refuse a next step time without a date, and clear the time with the date', () => {
        const apps = createApplicationStore(db);
        const app = apps.create({ company: 'Stripe', role: 'Intern', status: 'oa', applied_on: '2026-09-01' });
        expect(() => apps.update(app.id, { next_time: '14:00' })).toThrow('A time needs a date.');
        expect(apps.update(app.id, { next_on: '2026-10-06', next_time: '14:00' })).toMatchObject({ next_on: '2026-10-06', next_time: '14:00' });
        expect(apps.update(app.id, { next_time: '09:00' }).next_time).toBe('09:00');
        expect(apps.update(app.id, { next_on: null })).toMatchObject({ next_on: null, next_time: null });
        expect(apps.update(999, { status: 'oa' })).toBeNull();
    });

    it('fill in today when one to apply to moves on', () => {
        const apps = createApplicationStore(db, { now: () => new Date(2026, 8, 30, 12) });
        const app = apps.create({ company: 'x', role: 'y', status: 'to_apply' });
        expect(app.applied_on).toBeNull();
        expect(apps.update(app.id, { notes: 'Referral from Sam' }).applied_on).toBeNull();
        expect(apps.update(app.id, { status: 'applied' }).applied_on).toBe('2026-09-30');
        expect(() => apps.create({ company: 'x', role: 'y', status: 'applied' })).toThrow('An application needs the day it was sent.');
    });

    it('take the new statuses', () => {
        const apps = createApplicationStore(db);
        expect(apps.create({ company: 'x', role: 'y', status: 'withdrawn', applied_on: '2026-09-01' }).status).toBe('withdrawn');
        expect(apps.list({ status: 'withdrawn' })).toHaveLength(1);
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

    // Sep 2026: Sun 20, Mon 21 … Sat 26, Sun 27, Mon 28 … Wed 30
    it('count weeks in a row that met a weekly target, ending this week once met and last week until then', () => {
        const before = ['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21', '2026-09-23', '2026-09-25'];
        expect(streak(before, '2026-09-30', 3)).toBe(2);
        // this week is met on its third day, and counts from then on
        expect(streak([...before, '2026-09-27', '2026-09-28', '2026-09-30'], '2026-09-30', 3)).toBe(3);
        // a partial week short of the target doesn't end the streak
        expect(streak([...before, '2026-09-28'], '2026-09-30', 3)).toBe(2);
        // a missed week does
        expect(streak(['2026-09-07', '2026-09-08', '2026-09-21', '2026-09-22'], '2026-09-30', 2)).toBe(1);
        expect(streak([], '2026-09-30', 3)).toBe(0);
    });

    it('split weeks between Saturday and Sunday, or Sunday and Monday, as week_start says', () => {
        // Sat 26 and Sun 27: one week from Monday, two from Sunday
        const dates = ['2026-09-26', '2026-09-27'];
        expect(streak(dates, '2026-09-28', 2, 'monday')).toBe(1);
        expect(streak(dates, '2026-09-28', 2, 'sunday')).toBe(0);
        expect(streak(dates, '2026-09-27', 2, 'monday')).toBe(1);
        expect(streak(dates, '2026-09-27', 2, 'sunday')).toBe(0);
        // Sun 20 and Mon 21: one week from Sunday, two from Monday
        expect(streak(['2026-09-20', '2026-09-21'], '2026-09-26', 2, 'sunday')).toBe(1);
        expect(streak(['2026-09-20', '2026-09-21'], '2026-09-26', 2, 'monday')).toBe(0);
    });

    it('count days, as before, at 7 a week', () => {
        const dates = ['2026-09-30', '2026-09-29', '2026-09-28', '2026-09-26'];
        expect(streak(dates, '2026-09-30', 7, 'monday')).toBe(streak(dates, '2026-09-30'));
        expect(streak(dates, '2026-09-30', 7)).toBe(3);
    });

    it("list this week's count, with weeks starting on the setting, and the weekly streak", () => {
        let start = 'sunday';
        const habits = createHabitStore(db, { now, weekStart: () => start });
        const gym = habits.create({ name: 'Gym', per_week: 3 });
        for (const date of ['2026-09-21', '2026-09-23', '2026-09-26', '2026-09-27', '2026-09-29']) habits.setCheck(gym.id, date, true);
        expect(habits.withChecks(gym.id)).toMatchObject({ per_week: 3, week_count: 2, streak: 1 });
        // from Monday, Sunday the 27th belongs to last week, which then had 3 too
        start = 'monday';
        expect(habits.withChecks(gym.id)).toMatchObject({ week_count: 1, streak: 1 });
        expect(habits.create({ name: 'Read' }).per_week).toBe(7);
    });

    it('take today from the time zone, not UTC', () => {
        // 7:30 PM Saturday in Chicago is already Sunday in UTC
        const habits = createHabitStore(db, { now: () => new Date('2026-09-27T00:30:00Z') });
        const gym = habits.create({ name: 'Gym', per_week: 2 });
        habits.setCheck(gym.id, '2026-09-26', true);
        expect(habits.withChecks(gym.id).week_count).toBe(1);
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
        expect(settings.user()).toEqual({ ...DEFAULTS, assignments_area: 1 });
        expect(settings.get('kiosk_location')).toBeNull();
        settings.set('kiosk_location', { lat: 1, lon: 2 });
        expect(settings.get('kiosk_location')).toEqual({ lat: 1, lon: 2 });
        settings.clear('kiosk_location');
        expect(settings.get('kiosk_location')).toBeNull();
    });

    it('update user settings together', () => {
        const settings = createSettingsStore(db);
        expect(settings.updateUser({ night_start: '23:00' })).toEqual({ night_start: '23:00', night_end: '06:30', week_start: 'sunday', assignments_area: 1 });
        expect(settings.updateUser({ night_start: '21:30', night_end: '07:00', week_start: 'monday' })).toEqual({ night_start: '21:30', night_end: '07:00', week_start: 'monday', assignments_area: 1 });
    });

    it('keep the assignments area by id: School to start, none once deleted, refusing an unknown one', () => {
        const settings = createSettingsStore(db);
        db.prepare("UPDATE areas SET name = 'University' WHERE id = 1").run();
        expect(settings.get('assignments_area')).toBe(1);
        expect(settings.updateUser({ assignments_area: 2 }).assignments_area).toBe(2);
        db.prepare("UPDATE areas SET name = 'Jobs' WHERE id = 2").run();
        expect(settings.get('assignments_area')).toBe(2);
        expect(() => settings.updateUser({ assignments_area: 99 })).toThrow("There's no area 99.");
        db.prepare('DELETE FROM areas WHERE id = 2').run();
        expect(settings.get('assignments_area')).toBeNull();
    });
});
