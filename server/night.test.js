import { describe, expect, it } from 'vitest';
import { inNightHours, nextEnd, nightState } from './night.js';

const at = (h, m, day = 30) => new Date(2026, 8, day, h, m);
const DEFAULT = { night_start: '22:00', night_end: '06:30' };

describe('inNightHours', () => {
    it('wraps past midnight when the start is later than the end', () => {
        expect(inNightHours(at(21, 59), '22:00', '06:30')).toBe(false);
        expect(inNightHours(at(22, 0), '22:00', '06:30')).toBe(true);
        expect(inNightHours(at(0, 0), '22:00', '06:30')).toBe(true);
        expect(inNightHours(at(6, 29), '22:00', '06:30')).toBe(true);
        expect(inNightHours(at(6, 30), '22:00', '06:30')).toBe(false);
        expect(inNightHours(at(12, 0), '22:00', '06:30')).toBe(false);
    });

    it('handles hours within one day', () => {
        expect(inNightHours(at(0, 30), '00:00', '07:00')).toBe(true);
        expect(inNightHours(at(7, 0), '00:00', '07:00')).toBe(false);
    });

    it('is never night when start and end are the same', () => {
        expect(inNightHours(at(22, 0), '22:00', '22:00')).toBe(false);
    });
});

describe('nextEnd', () => {
    it('is later today if the end time is still ahead, otherwise tomorrow', () => {
        expect(nextEnd(at(2, 0), '06:30')).toEqual(at(6, 30));
        expect(nextEnd(at(23, 0), '06:30')).toEqual(new Date(2026, 9, 1, 6, 30));
        expect(nextEnd(at(6, 30), '06:30')).toEqual(new Date(2026, 9, 1, 6, 30));
    });

    it('lands on the right local time across a clock change', () => {
        // clocks go back at 02:00 on 2026-11-01 in Chicago
        expect(nextEnd(new Date(2026, 9, 31, 23, 0), '06:30')).toEqual(new Date(2026, 10, 1, 6, 30));
        expect(nextEnd(new Date(2026, 9, 31, 23, 0), '06:30').getHours()).toBe(6);
    });
});

describe('nightState', () => {
    it('is active in night hours, until the next end', () => {
        expect(nightState(at(23, 0), DEFAULT)).toEqual({
            active: true,
            early: false,
            until: new Date(2026, 9, 1, 6, 30).toISOString(),
            start: '22:00',
            end: '06:30',
        });
    });

    it('is inactive by day', () => {
        expect(nightState(at(15, 0), DEFAULT)).toMatchObject({ active: false, until: null });
    });

    it('follows an early start until it runs out', () => {
        const until = new Date(2026, 9, 1, 6, 30).toISOString();
        expect(nightState(at(20, 0), { ...DEFAULT, night_early_until: until })).toMatchObject({ active: true, early: true, until });
        expect(nightState(new Date(2026, 9, 1, 7, 0), { ...DEFAULT, night_early_until: until }).active).toBe(false);
    });
});
