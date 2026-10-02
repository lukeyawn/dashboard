import { describe, expect, it } from 'vitest';
import { compareDue, compareTasks, isDueSoon, minutesLabel } from './tasks.js';

const t = (id, fields) => ({ id, priority: 'soon', due: null, minutes: null, ...fields });

describe('isDueSoon', () => {
    it('is overdue or due within 14 days', () => {
        expect(isDueSoon(t(1, { due: '2026-09-01' }), '2026-09-30')).toBe(true);
        expect(isDueSoon(t(1, { due: '2026-10-14' }), '2026-09-30')).toBe(true);
        expect(isDueSoon(t(1, { due: '2026-10-15' }), '2026-09-30')).toBe(false);
        expect(isDueSoon(t(1), '2026-09-30')).toBe(false);
    });
});

describe('compareTasks', () => {
    it('orders now, soon, someday, then due date, then shortest first, then age', () => {
        const tasks = [
            t(1, { priority: 'someday' }),
            t(2),
            t(3, { minutes: 120 }),
            t(4, { minutes: 5 }),
            t(5, { due: '2026-12-01' }),
            t(6, { priority: 'now' }),
            t(7),
        ];
        expect(tasks.sort(compareTasks).map(x => x.id)).toEqual([6, 5, 4, 3, 2, 7, 1]);
    });
});

describe('compareDue', () => {
    it('orders by due date, then priority', () => {
        const tasks = [t(1, { due: '2026-10-02' }), t(2, { due: '2026-10-01' }), t(3, { due: '2026-10-02', priority: 'now' })];
        expect(tasks.sort(compareDue).map(x => x.id)).toEqual([2, 3, 1]);
    });
});

describe('minutesLabel (docs/BLOCKS.md §3)', () => {
    it('reads minutes under an hour, 1h at an hour, and 1h+ above', () => {
        expect(minutesLabel(null)).toBeNull();
        expect(minutesLabel(15)).toBe('15m');
        expect(minutesLabel(59)).toBe('59m');
        expect(minutesLabel(60)).toBe('1h');
        expect(minutesLabel(61)).toBe('1h+');
        expect(minutesLabel(600)).toBe('1h+');
    });
});
