import { describe, expect, it } from 'vitest';
import { compareDue, compareTasks, isDueSoon } from './tasks.js';

const t = (id, fields) => ({ id, priority: 'normal', due: null, effort: null, ...fields });

describe('isDueSoon', () => {
    it('is overdue or due within 14 days', () => {
        expect(isDueSoon(t(1, { due: '2026-09-01' }), '2026-09-30')).toBe(true);
        expect(isDueSoon(t(1, { due: '2026-10-14' }), '2026-09-30')).toBe(true);
        expect(isDueSoon(t(1, { due: '2026-10-15' }), '2026-09-30')).toBe(false);
        expect(isDueSoon(t(1), '2026-09-30')).toBe(false);
    });
});

describe('compareTasks', () => {
    it('orders by priority, then due date, then effort, then age', () => {
        const tasks = [
            t(1, { priority: 'low' }),
            t(2),
            t(3, { effort: 'big' }),
            t(4, { effort: 'quick' }),
            t(5, { due: '2026-12-01' }),
            t(6, { priority: 'high' }),
        ];
        expect(tasks.sort(compareTasks).map(x => x.id)).toEqual([6, 5, 4, 3, 2, 1]);
    });
});

describe('compareDue', () => {
    it('orders by due date, then priority', () => {
        const tasks = [t(1, { due: '2026-10-02' }), t(2, { due: '2026-10-01' }), t(3, { due: '2026-10-02', priority: 'high' })];
        expect(tasks.sort(compareDue).map(x => x.id)).toEqual([2, 3, 1]);
    });
});
