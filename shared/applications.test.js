import { describe, expect, it } from 'vitest';
import { boardApplications } from './applications.js';

const app = (id, status, extra = {}) => ({ id, company: `C${id}`, status, applied_on: '2026-09-01', next_on: null, next_time: null, ...extra });

describe('boardApplications', () => {
    it('puts OAs, interviews and offers first by their next step, then the most recently applied', () => {
        const order = boardApplications([
            app(1, 'applied', { applied_on: '2026-09-20' }),
            app(2, 'interview', { next_on: '2026-10-06', next_time: '14:00' }),
            app(3, 'offer', { next_on: '2026-10-20' }),
            app(4, 'oa', { next_on: '2026-10-06', next_time: '09:00' }),
            app(5, 'applied', { applied_on: '2026-09-28' }),
            app(6, 'interview'),
            app(7, 'oa', { next_on: '2026-10-02' }),
        ]).map(a => a.id);
        // an active one with no date yet goes after the dated ones, still before the applied
        expect(order).toEqual([7, 4, 2, 3, 6, 5, 1]);
    });

    it('leaves out rejected and withdrawn', () => {
        expect(boardApplications([app(1, 'rejected'), app(2, 'withdrawn'), app(3, 'applied')]).map(a => a.id)).toEqual([3]);
    });

    it('puts a time before no time on the same day, and breaks ties by the newest', () => {
        expect(boardApplications([
            app(1, 'oa', { next_on: '2026-10-06' }),
            app(2, 'oa', { next_on: '2026-10-06', next_time: '23:00' }),
            app(3, 'applied'),
            app(4, 'applied'),
        ]).map(a => a.id)).toEqual([2, 1, 4, 3]);
    });
});
