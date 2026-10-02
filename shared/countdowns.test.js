import { describe, expect, it } from 'vitest';
import { compareCountdowns, countdownMoment, countdownProblems, detailProblem, formatClock, pastDateProblem } from './countdowns.js';

// Wednesday Sep 30, 2026, 2:30 PM in Chicago (the tests run in America/Chicago)
const NOW = new Date(2026, 8, 30, 14, 30);

describe('pastDateProblem', () => {
    it('refuses a past date, with a hint when the same date next year is ahead', () => {
        expect(pastDateProblem({ target_date: '2026-01-01' }, NOW)).toBe('That date has passed (Jan 1, 2026). Did you mean 2027?');
        expect(pastDateProblem({ target_date: '2026-09-29', target_time: '09:00' }, NOW)).toBe('That date has passed (Sep 29, 2026). Did you mean 2027?');
    });

    it('gives no hint when next year is past too, or has no such date', () => {
        expect(pastDateProblem({ target_date: '2024-05-01' }, NOW)).toBe('That date has passed (May 1, 2024).');
        expect(pastDateProblem({ target_date: '2024-02-29' }, NOW)).toBe('That date has passed (Feb 29, 2024).');
    });

    it('allows today, and a time today until it comes', () => {
        expect(pastDateProblem({ target_date: '2026-09-30' }, NOW)).toBeNull();
        expect(pastDateProblem({ target_date: '2026-09-30', target_time: '14:31' }, NOW)).toBeNull();
        expect(pastDateProblem({ target_date: '2026-09-30', target_time: '14:30' }, NOW)).toBe('That time has passed (2:30 PM today).');
        expect(pastDateProblem({ target_date: '2026-10-01', target_time: '00:00' }, NOW)).toBeNull();
    });
});

describe('countdownProblems', () => {
    const past = { id: 1, label: 'New Years!', target_date: '2026-01-01', target_time: null, detail: 'days' };

    it('lets a past countdown be renamed, but not moved to another past date', () => {
        expect(countdownProblems({ label: 'New Year 2026' }, NOW, past)).toBeNull();
        expect(countdownProblems({ target_date: '2026-02-01' }, NOW, past)).toEqual({ target_date: 'That date has passed (Feb 1, 2026). Did you mean 2027?' });
        expect(countdownProblems({ target_date: '2027-01-01' }, NOW, past)).toBeNull();
    });

    it('puts a time passed today beside the time', () => {
        expect(countdownProblems({ label: 'Call', target_date: '2026-09-30', target_time: '09:00' }, NOW)).toEqual({ target_time: 'That time has passed (9:00 AM today).' });
    });

    it('needs a time for hours and live, also when only the detail changes', () => {
        expect(detailProblem({ detail: 'live' })).toBe('Hours and live need a time.');
        expect(detailProblem({ detail: 'days' })).toBeNull();
        const finals = { ...past, target_date: '2026-12-10' };
        expect(countdownProblems({ detail: 'hours' }, NOW, finals)).toEqual({ detail: 'Hours and live need a time.' });
        expect(countdownProblems({ detail: 'hours', target_time: '09:00' }, NOW, finals)).toBeNull();
        expect(countdownProblems({ target_time: null }, NOW, { ...finals, target_time: '09:00', detail: 'live' })).toEqual({ detail: 'Hours and live need a time.' });
    });
});

describe('countdownMoment and the order', () => {
    it('counts to the time, or the start of the day', () => {
        expect(countdownMoment({ target_date: '2026-11-01', target_time: null })).toEqual(new Date(2026, 10, 1));
        expect(countdownMoment({ target_date: '2026-11-01', target_time: '09:15' })).toEqual(new Date(2026, 10, 1, 9, 15));
    });

    it('orders by date, then no time first, then time', () => {
        const rows = [
            { id: 1, target_date: '2026-10-02', target_time: '18:00' },
            { id: 2, target_date: '2026-10-02', target_time: null },
            { id: 3, target_date: '2026-10-01', target_time: '23:00' },
            { id: 4, target_date: '2026-10-02', target_time: '09:00' },
        ];
        expect(rows.sort(compareCountdowns).map(r => r.id)).toEqual([3, 2, 4, 1]);
    });

    it('formats a time for people', () => {
        expect(formatClock('00:00')).toBe('12:00 AM');
        expect(formatClock('12:05')).toBe('12:05 PM');
        expect(formatClock('23:59')).toBe('11:59 PM');
    });
});
