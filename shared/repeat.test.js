import { describe, expect, it } from 'vitest';
import { describeRepeat, nextOccurrence } from './repeat.js';

// the tests run in America/Chicago, across the 2026 clock changes
describe('nextOccurrence (docs/BLOCKS.md §3)', () => {
    it('moves to the first occurrence after today, skipping missed ones', () => {
        const daily = { every: 1, unit: 'day' };
        expect(nextOccurrence(daily, '2026-09-30', '2026-09-30')).toBe('2026-10-01');
        // three days late: no pile of missed days
        expect(nextOccurrence(daily, '2026-09-27', '2026-09-30')).toBe('2026-10-01');
        const everyThree = { every: 3, unit: 'day' };
        expect(nextOccurrence(everyThree, '2026-09-24', '2026-09-30')).toBe('2026-10-03');
    });

    it('still moves forward when completed early', () => {
        // laundry due Sunday, done on Friday: next is the Sunday after
        expect(nextOccurrence({ every: 1, unit: 'week' }, '2026-10-04', '2026-10-02')).toBe('2026-10-11');
    });

    it('keeps the weekday, or follows a set of weekdays, every n weeks', () => {
        expect(nextOccurrence({ every: 2, unit: 'week' }, '2026-09-27', '2026-09-27')).toBe('2026-10-11');
        // Mon and Thu: from a Monday, Thursday is next
        const monThu = { every: 1, unit: 'week', weekdays: [1, 4] };
        expect(nextOccurrence(monThu, '2026-09-28', '2026-09-28')).toBe('2026-10-01');
        expect(nextOccurrence(monThu, '2026-10-01', '2026-10-01')).toBe('2026-10-05');
        // every other week on Mon and Thu: the off week is skipped
        expect(nextOccurrence({ ...monThu, every: 2 }, '2026-10-01', '2026-10-01')).toBe('2026-10-12');
    });

    it('crosses the clock change by calendar days', () => {
        expect(nextOccurrence({ every: 1, unit: 'week' }, '2026-10-29', '2026-10-29')).toBe('2026-11-05');
        expect(nextOccurrence({ every: 1, unit: 'day' }, '2026-03-07', '2026-03-07')).toBe('2026-03-08');
    });

    it('lands on the day of the month, or the last day of a shorter month', () => {
        const rent = { every: 1, unit: 'month', day_of_month: 1 };
        expect(nextOccurrence(rent, '2026-10-01', '2026-10-03')).toBe('2026-11-01');
        const lastDay = { every: 1, unit: 'month', day_of_month: 31 };
        expect(nextOccurrence(lastDay, '2026-01-31', '2026-01-31')).toBe('2026-02-28');
        expect(nextOccurrence(lastDay, '2026-02-28', '2026-02-28')).toBe('2026-03-31');
        expect(nextOccurrence(lastDay, '2028-01-31', '2028-01-31')).toBe('2028-02-29');
        // without a day, the due date's own day
        expect(nextOccurrence({ every: 3, unit: 'month' }, '2026-11-15', '2026-11-15')).toBe('2027-02-15');
    });

    it('repeats yearly, Feb 29 falling on Feb 28 in other years', () => {
        expect(nextOccurrence({ every: 1, unit: 'year' }, '2026-04-15', '2026-04-15')).toBe('2027-04-15');
        expect(nextOccurrence({ every: 1, unit: 'year' }, '2028-02-29', '2028-02-29')).toBe('2029-02-28');
        expect(nextOccurrence({ every: 1, unit: 'year' }, '2025-04-15', '2026-09-30')).toBe('2027-04-15');
    });
});

describe('describeRepeat', () => {
    it('says the rule in words', () => {
        expect(describeRepeat(null)).toBeNull();
        expect(describeRepeat({ every: 1, unit: 'day' })).toBe('every day');
        expect(describeRepeat({ every: 2, unit: 'week' })).toBe('every 2 weeks');
        expect(describeRepeat({ every: 1, unit: 'week', weekdays: [4, 1] })).toBe('every week on Mon, Thu');
        expect(describeRepeat({ every: 1, unit: 'month', day_of_month: 1 })).toBe('every month on the 1st');
        expect(describeRepeat({ every: 1, unit: 'month', day_of_month: 22 })).toBe('every month on the 22nd');
        expect(describeRepeat({ every: 1, unit: 'month', day_of_month: 11 })).toBe('every month on the 11th');
        expect(describeRepeat({ every: 1, unit: 'year' })).toBe('every year');
    });
});
