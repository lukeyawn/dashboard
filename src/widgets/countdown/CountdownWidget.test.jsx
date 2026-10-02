// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeServer } from '../../testing/fakeApi';
import { chooseCountdown, countdownDisplay, countdownNumber, needsSeconds } from './countdown';
import CountdownWidget from './CountdownWidget';

const todayDate = '2026-09-30';
const finals = { label: 'Finals', target_date: '2026-12-10', pinned: false };
const breakDay = { label: 'Thanksgiving break', target_date: '2026-11-25', pinned: true };
const past = { label: 'Old', target_date: '2026-09-01', pinned: false };

describe('chooseCountdown', () => {
    it('picks a birthday within 7 days first', () => {
        const birthdays = [{ title: "Mom's birthday", date: '2026-10-03' }];
        expect(chooseCountdown({ todayDate, countdowns: [breakDay], birthdays })).toEqual({ label: "Mom's birthday", date: '2026-10-03', time: null, detail: 'days' });
    });

    it('ignores birthdays further away, then prefers the pinned countdown', () => {
        const birthdays = [{ title: 'Later', date: '2026-10-08' }];
        expect(chooseCountdown({ todayDate, countdowns: [finals, breakDay], birthdays }).label).toBe('Thanksgiving break');
    });

    it('otherwise picks the nearest upcoming countdown, skipping past ones', () => {
        expect(chooseCountdown({ todayDate, countdowns: [past, { ...breakDay, pinned: false }, finals] }).label).toBe('Thanksgiving break');
        expect(chooseCountdown({ todayDate, countdowns: [past] })).toBeNull();
        expect(chooseCountdown({ todayDate })).toBeNull();
    });

    it('skips a pinned countdown whose day has passed, and orders by date and time', () => {
        const pinnedPast = { ...past, id: 9, pinned: true };
        const early = { id: 2, label: 'Flight', target_date: '2026-10-02', target_time: '09:00', detail: 'hours', pinned: false };
        const late = { id: 1, label: 'Dinner', target_date: '2026-10-02', target_time: '19:00', detail: 'days', pinned: false };
        expect(chooseCountdown({ todayDate, countdowns: [pinnedPast, late, early] })).toEqual({ label: 'Flight', date: '2026-10-02', time: '09:00', detail: 'hours' });
    });
});

describe('countdownNumber', () => {
    it('counts days up to 60, then weeks, and says Today on the day', () => {
        expect(countdownNumber(0)).toEqual({ number: 'Today', unit: null });
        expect(countdownNumber(1)).toEqual({ number: '1', unit: 'day' });
        expect(countdownNumber(60)).toEqual({ number: '60', unit: 'days' });
        expect(countdownNumber(61)).toEqual({ number: '9', unit: 'weeks' });
    });
});

describe('countdownDisplay (docs/BLOCKS.md §4)', () => {
    const at = (...args) => new Date(2026, ...args);
    const flight = { date: '2026-10-02', time: '14:00' };

    it('shows days, then Today all through the day, with detail days even with a time', () => {
        const c = { ...flight, detail: 'days' };
        expect(countdownDisplay(c, at(8, 30, 15, 0))).toEqual({ number: '2', unit: 'days' });
        expect(countdownDisplay(c, at(9, 2, 9, 0))).toEqual({ number: 'Today', unit: null });
        expect(countdownDisplay(c, at(9, 2, 20, 0))).toEqual({ number: 'Today', unit: null });
    });

    it('shows hours under 48 hours and minutes under 1, then Today once the time has come', () => {
        const c = { ...flight, detail: 'hours' };
        expect(countdownDisplay(c, at(8, 30, 14, 0))).toEqual({ number: '2', unit: 'days' });
        expect(countdownDisplay(c, at(8, 30, 14, 1))).toEqual({ number: '47', unit: 'hours' });
        expect(countdownDisplay(c, at(9, 2, 12, 30))).toEqual({ number: '1', unit: 'hour' });
        expect(countdownDisplay(c, at(9, 2, 13, 0, 30))).toEqual({ number: '1', unit: 'hour' });
        expect(countdownDisplay(c, at(9, 2, 13, 1))).toEqual({ number: '59', unit: 'minutes' });
        expect(countdownDisplay(c, at(9, 2, 13, 59, 30))).toEqual({ number: '1', unit: 'minute' });
        expect(countdownDisplay(c, at(9, 2, 14, 0))).toEqual({ number: 'Today', unit: null });
    });

    it('ticks H:MM:SS in a live countdown\'s last 24 hours, and the seconds alone in its last minute', () => {
        const newYear = { date: '2027-01-01', time: '00:00', detail: 'live' };
        const dec31 = (...time) => new Date(2026, 11, 31, ...time);
        expect(countdownDisplay(newYear, new Date(2026, 11, 30, 0, 0))).toEqual({ number: '2', unit: 'days' });
        expect(countdownDisplay(newYear, new Date(2026, 11, 30, 0, 1))).toEqual({ number: '47', unit: 'hours' });
        expect(countdownDisplay(newYear, new Date(2026, 11, 30, 23, 0))).toEqual({ number: '25', unit: 'hours' });
        expect(countdownDisplay(newYear, dec31(0, 0))).toEqual({ number: '24:00:00', unit: null, kind: 'clock' });
        expect(countdownDisplay(newYear, dec31(23, 58, 59, 500))).toEqual({ number: '0:01:01', unit: null, kind: 'clock' });
        expect(countdownDisplay(newYear, dec31(23, 59, 0, 500))).toEqual({ number: '0:01:00', unit: null, kind: 'clock' });
        expect(countdownDisplay(newYear, dec31(23, 59, 1))).toEqual({ number: '59', unit: null, kind: 'seconds' });
        expect(countdownDisplay(newYear, dec31(23, 59, 50))).toEqual({ number: '10', unit: null, kind: 'seconds' });
        expect(countdownDisplay(newYear, new Date(2027, 0, 1, 0, 0))).toEqual({ number: 'Today', unit: null });
    });

    it('counts real hours across the clock change', () => {
        // Nov 1, 2026 is 25 hours long: from midnight to 9 AM is 10 hours
        const c = { date: '2026-11-01', time: '09:00', detail: 'hours' };
        expect(countdownDisplay(c, new Date(2026, 10, 1, 0, 0))).toEqual({ number: '10', unit: 'hours' });
    });

    it('ticks every second only in a live countdown\'s last day', () => {
        const newYear = { date: '2027-01-01', time: '00:00', detail: 'live' };
        expect(needsSeconds(newYear, new Date(2026, 11, 31, 12, 0))).toBe(true);
        expect(needsSeconds(newYear, new Date(2026, 11, 30, 12, 0))).toBe(false);
        expect(needsSeconds(newYear, new Date(2027, 0, 1, 0, 0, 1))).toBe(false);
        expect(needsSeconds({ ...newYear, detail: 'hours' }, new Date(2026, 11, 31, 12, 0))).toBe(false);
    });
});

describe('CountdownWidget', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 8, 30, 12, 0));
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    function setup({ countdowns = [finals], birthdays = [] } = {}) {
        const api = fakeServer({ 'GET /api/countdowns': () => countdowns, 'GET /api/birthdays': () => birthdays });
        api.install();
        render(<CountdownWidget />);
        return api;
    }

    it('shows the number and what it counts to', async () => {
        const api = setup();
        expect(await screen.findByText('10')).toBeTruthy();
        expect(screen.getByText('weeks until Finals')).toBeTruthy();
        expect(api.requests.map(r => r.url)).toContain('/api/birthdays?from=2026-09-30&to=2026-10-07');
    });

    it('says Today on the day', async () => {
        setup({ countdowns: [], birthdays: [{ title: "Mom's birthday", date: '2026-09-30' }] });
        expect(await screen.findByText('Today')).toBeTruthy();
        expect(screen.getByText("Mom's birthday")).toBeTruthy();
    });

    it("ticks a live countdown's last minute every second, the seconds alone", async () => {
        vi.useRealTimers();
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 50));
        setup({ countdowns: [{ id: 1, label: "New Year's!", target_date: '2027-01-01', target_time: '00:00', detail: 'live', pinned: false }] });
        await act(async () => {});
        expect(screen.getByLabelText("10 seconds until New Year's!").textContent).toBe('10');
        expect(screen.queryByText("New Year's!")).toBeNull();
        await act(async () => vi.advanceTimersByTime(1000));
        expect(screen.getByText('9')).toBeTruthy();
        await act(async () => vi.advanceTimersByTime(9000));
        expect(screen.getByText('Today')).toBeTruthy();
        expect(screen.getByText("New Year's!")).toBeTruthy();
    });

    it('shows the live clock in the last day', async () => {
        vi.setSystemTime(new Date(2026, 11, 31, 21, 30));
        setup({ countdowns: [{ id: 1, label: "New Year's!", target_date: '2027-01-01', target_time: '00:00', detail: 'live', pinned: false }] });
        expect(await screen.findByText('2:30:00')).toBeTruthy();
        expect(screen.getByText("until New Year's!")).toBeTruthy();
    });

    it('shows when there is nothing to count down to', async () => {
        setup({ countdowns: [] });
        expect(await screen.findByText('No countdowns')).toBeTruthy();
    });

    it('says when it could not load', async () => {
        const api = fakeServer({ 'GET /api/birthdays': () => [] });
        api.failNext(500);
        api.install();
        render(<CountdownWidget />);
        await act(async () => {});
        expect(await screen.findByText("Couldn't load countdowns")).toBeTruthy();
    });
});

describe('CountdownWidget and Claude', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('marks a countdown Claude added', async () => {
        const claude_change = { id: 4, at: '2026-09-30T14:00:00.000Z', actor: 'claude', via: 'claude.ai' };
        expect(chooseCountdown({ todayDate, countdowns: [{ ...finals, claude_change }] }).claude_change).toEqual(claude_change);
        fakeServer({ 'GET /api/countdowns': () => [{ ...finals, claude_change }], 'GET /api/birthdays': () => [] }).install();
        render(<CountdownWidget />);
        expect(await screen.findByLabelText('Added by Claude (claude.ai)')).toBeTruthy();
    });
});
