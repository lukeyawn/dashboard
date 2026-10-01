import { describe, expect, it } from 'vitest';
import { AREAS, COLUMNS, ROWS, placement } from './layout.js';

describe('layout', () => {
    it('covers every cell of the grid exactly once', () => {
        const owner = Array.from({ length: ROWS }, () => Array(COLUMNS).fill(null));
        for (const [area, { col, row }] of Object.entries(AREAS)) {
            for (let r = row[0]; r <= row[1]; r++) {
                for (let c = col[0]; c <= col[1]; c++) {
                    expect(owner[r - 1][c - 1], `${area} overlaps at row ${r}, column ${c}`).toBeNull();
                    owner[r - 1][c - 1] = area;
                }
            }
        }
        expect(owner.flat().every(Boolean)).toBe(true);
    });

    it('gives grid lines and spans for an area', () => {
        expect(placement('tasks')).toEqual({ gridColumn: '5 / 9', gridRow: '3 / 6', cols: 4, rows: 3 });
        expect(placement('wotd')).toEqual({ gridColumn: '3 / 4', gridRow: '5 / 6', cols: 1, rows: 1 });
    });

    it('rejects an unknown area', () => {
        expect(() => placement('weather')).toThrow('Unknown layout area');
    });
});
