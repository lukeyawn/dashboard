// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_MS } from '../../config';
import { fakeServer } from '../../testing/fakeApi';
import DeadlinesWidget from './DeadlinesWidget';
import { daysLabel } from './daysLabel';

const NOW = new Date(2026, 8, 30, 12, 0);
let deadlines;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    deadlines = [
        { id: 1, name: 'Late essay', due: '2026-09-28', course: 'RHE 306', done_at: null },
        { id: 2, name: 'Pset 4', due: '2026-10-01', course: null, done_at: null },
        { id: 3, name: 'Midterm', due: '2026-10-14', course: 'CS 331', done_at: null },
    ];
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function setup() {
    const api = fakeServer({
        'GET /api/deadlines': () => deadlines.filter(d => !d.done_at),
        'PATCH /api/deadlines/:id': ({ params, body }) => Object.assign(deadlines.find(d => d.id === Number(params.id)), body),
    });
    api.install();
    render(<DeadlinesWidget />);
    return api;
}

it('labels days until due', () => {
    expect([-1, 0, 1, 2, 30].map(daysLabel)).toEqual(['overdue', 'today', 'tomorrow', '2 days', '30 days']);
});

describe('DeadlinesWidget', () => {
    it('lists open deadlines, marking overdue and soon ones urgent', async () => {
        setup();
        await act(() => vi.advanceTimersByTimeAsync(0));
        const rows = screen.getAllByRole('listitem');
        expect(rows.map(r => r.querySelector('.deadline-days').textContent)).toEqual(['overdue', 'tomorrow', '14 days']);
        expect(rows.map(r => r.classList.contains('urgent'))).toEqual([true, true, false]);
        expect(rows[0].textContent).toContain('Mon, Sep 28 · RHE 306');
    });

    it('completes a deadline 5 seconds after a tap', async () => {
        const api = setup();
        await act(() => vi.advanceTimersByTimeAsync(0));
        fireEvent.click(screen.getByText('Pset 4'));
        expect(screen.getByText('Pset 4').closest('li').className).toContain('pending');
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/deadlines/2', body: { done_at: new Date(NOW.getTime() + PENDING_MS).toISOString() } }]);
        expect(screen.queryByText('Pset 4')).toBeNull();
    });

    it('shows when there are none, or loading failed', async () => {
        deadlines = [];
        setup();
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText('No deadlines.')).toBeTruthy();
    });

    it('says when it could not load', async () => {
        const api = fakeServer({});
        api.failNext(500);
        api.install();
        render(<DeadlinesWidget />);
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText("Couldn't load deadlines.")).toBeTruthy();
    });
});
