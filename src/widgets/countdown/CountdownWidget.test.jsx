// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeServer } from '../../testing/fakeApi';
import { chooseCountdown, countdownNumber } from './countdown';
import CountdownWidget from './CountdownWidget';

const todayDate = '2026-09-30';
const finals = { label: 'Finals', target_date: '2026-12-10', pinned: false };
const breakDay = { label: 'Thanksgiving break', target_date: '2026-11-25', pinned: true };
const past = { label: 'Old', target_date: '2026-09-01', pinned: false };

describe('chooseCountdown', () => {
    it('picks a birthday within 7 days first', () => {
        const birthdays = [{ title: "Mom's birthday", date: '2026-10-03' }];
        expect(chooseCountdown({ todayDate, countdowns: [breakDay], birthdays })).toEqual({ label: "Mom's birthday", date: '2026-10-03' });
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
});

describe('countdownNumber', () => {
    it('counts days up to 60, then weeks, and says Today on the day', () => {
        expect(countdownNumber(0)).toEqual({ number: 'Today', unit: null });
        expect(countdownNumber(1)).toEqual({ number: '1', unit: 'day' });
        expect(countdownNumber(60)).toEqual({ number: '60', unit: 'days' });
        expect(countdownNumber(61)).toEqual({ number: '9', unit: 'weeks' });
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
