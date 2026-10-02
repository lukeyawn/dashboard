import { describe, expect, it } from 'vitest';
import { pace, shortDeadline, timeLeft } from './goals.js';

const goal = fields => ({ kind: 'progress', current: 0, target: 100, started: '2026-09-01', deadline: '2026-12-10', ...fields });

describe('pace (docs/BLOCKS.md §5)', () => {
    it('runs from 0 on the start day to the target on the deadline', () => {
        expect(pace(goal(), '2026-09-01').expected).toBe(0);
        expect(pace(goal(), '2026-12-10').expected).toBe(100);
        expect(pace(goal({ started: '2026-10-01', deadline: '2026-10-11' }), '2026-10-06').expected).toBe(50);
        // and stays within them before the start and after the deadline
        expect(pace(goal(), '2026-08-01').expected).toBe(0);
        expect(pace(goal(), '2027-01-01').expected).toBe(100);
    });

    it('is behind only when more than 10% of the target short of the tick', () => {
        const at = current => pace(goal({ started: '2026-10-01', deadline: '2026-10-11', current }), '2026-10-06');
        expect(at(41).behind).toBe(false);
        expect(at(40).behind).toBe(false);
        expect(at(39.9).behind).toBe(true);
        expect(at(80).behind).toBe(false);
    });

    it('is null without a deadline, and for a milestone', () => {
        expect(pace(goal({ deadline: null }), '2026-10-01')).toBeNull();
        expect(pace({ kind: 'milestone', deadline: '2026-12-31', started: '2026-09-01' }, '2026-10-01')).toBeNull();
    });

    it('counts a deadline on the start day as due', () => {
        expect(pace(goal({ started: '2026-10-01', deadline: '2026-10-01' }), '2026-10-01').expected).toBe(100);
    });
});

describe('timeLeft', () => {
    it('reads days, then weeks, then months', () => {
        const left = deadline => timeLeft(deadline, '2026-10-01');
        expect(['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-14', '2026-10-15', '2026-11-29', '2026-11-30', '2027-10-01'].map(left))
            .toEqual(['past the deadline', 'due today', '1 day left', '13 days left', '2 wk left', '8 wk left', '2 mo left', '12 mo left']);
    });
});

describe('shortDeadline', () => {
    it('adds the year only when it is not this one', () => {
        expect(shortDeadline('2026-12-31', '2026-10-01')).toBe('Dec 31');
        expect(shortDeadline('2027-05-01', '2026-10-01')).toBe('May 1, 2027');
    });
});
