import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, formatDate, isDateString, parseDate, startOfWeek, today } from './dates.js';

// tests run with TZ=America/Chicago (see package.json), where clocks change on
// 2026-03-08 and 2026-11-01

describe('parseDate', () => {
    it('gives local midnight, not UTC midnight', () => {
        const date = parseDate('2026-10-02');
        expect(date.getFullYear()).toBe(2026);
        expect(date.getMonth()).toBe(9);
        expect(date.getDate()).toBe(2);
        expect(date.getHours()).toBe(0);
        // the trap it exists to avoid: the built-in parser lands on the previous day here
        expect(new Date('2026-10-02').getDate()).toBe(1);
    });

    it('rejects malformed and impossible dates', () => {
        for (const text of ['2026-2-01', '2026-02-30', '2026-13-01', '0099-01-01', 'today', '', null, 20261002]) {
            expect(() => parseDate(text)).toThrow();
        }
    });
});

describe('isDateString', () => {
    it('accepts real dates, including leap days', () => {
        expect(isDateString('2028-02-29')).toBe(true);
        expect(isDateString('2026-02-29')).toBe(false);
    });
});

describe('formatDate and today', () => {
    it('round-trips with parseDate', () => {
        expect(formatDate(parseDate('2026-01-05'))).toBe('2026-01-05');
    });

    it('uses the local date late in the evening, when the UTC date has already moved on', () => {
        const lateEvening = new Date(2026, 8, 30, 23, 30);
        expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-10-01');
        expect(today(lateEvening)).toBe('2026-09-30');
    });
});

describe('addDays', () => {
    it('crosses month and year ends', () => {
        expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('steps over clock changes by calendar day', () => {
        expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
        expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
        expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
        expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    });
});

describe('daysBetween', () => {
    it('counts whole days in either direction', () => {
        expect(daysBetween('2026-09-30', '2026-10-02')).toBe(2);
        expect(daysBetween('2026-10-02', '2026-09-30')).toBe(-2);
        expect(daysBetween('2026-09-30', '2026-09-30')).toBe(0);
    });

    it('is exact across the 23- and 25-hour days', () => {
        expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
        expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
        expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
    });
});

describe('startOfWeek', () => {
    it('finds the Sunday or Monday that starts the week', () => {
        // Wednesday Sep 30, 2026
        expect(startOfWeek('2026-09-30', 'sunday')).toBe('2026-09-27');
        expect(startOfWeek('2026-09-30', 'monday')).toBe('2026-09-28');
        expect(startOfWeek('2026-09-30')).toBe('2026-09-27');
    });

    it('puts Sunday first or last, as the setting says', () => {
        expect(startOfWeek('2026-09-27', 'sunday')).toBe('2026-09-27');
        expect(startOfWeek('2026-09-27', 'monday')).toBe('2026-09-21');
        expect(startOfWeek('2026-09-28', 'monday')).toBe('2026-09-28');
        expect(startOfWeek('2026-09-26', 'sunday')).toBe('2026-09-20');
    });

    it('crosses month and year ends and the clock change', () => {
        expect(startOfWeek('2026-10-01', 'sunday')).toBe('2026-09-27');
        expect(startOfWeek('2027-01-01', 'monday')).toBe('2026-12-28');
        expect(startOfWeek('2026-11-03', 'sunday')).toBe('2026-11-01');
        expect(startOfWeek('2026-11-01', 'monday')).toBe('2026-10-26');
    });
});
