// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_MS } from '../../config';
import { fakeServer } from '../../testing/fakeApi';
import DueSoonWidget from './DueSoonWidget';
import { daysLabel } from './daysLabel';

const NOW = new Date(2026, 8, 30, 12, 0);
let tasks;
const task = (id, fields) => ({ id, done_at: null, due: null, priority: 'normal', effort: null, area: null, ...fields });

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    tasks = [
        task(1, { name: 'Late essay', due: '2026-09-28', area: 'RHE 306' }),
        task(2, { name: 'Pset 4', due: '2026-10-01' }),
        task(3, { name: 'Midterm', due: '2026-10-14', area: 'CS 331' }),
        task(4, { name: 'Far off', due: '2026-12-01' }),
        task(5, { name: 'No date' }),
    ];
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function setup() {
    const api = fakeServer({
        'GET /api/tasks': () => tasks.filter(t => !t.done_at),
        'PATCH /api/tasks/:id': ({ params, body }) => Object.assign(tasks.find(t => t.id === Number(params.id)), body),
    });
    api.install();
    render(<DueSoonWidget />);
    return api;
}

it('labels days until due', () => {
    expect([-1, 0, 1, 2, 30].map(daysLabel)).toEqual(['overdue', 'today', 'tomorrow', '2 days', '30 days']);
});

describe('DueSoonWidget', () => {
    it('lists tasks overdue or due within 14 days, soonest first, marking the urgent ones', async () => {
        setup();
        await act(() => vi.advanceTimersByTimeAsync(0));
        const rows = screen.getAllByRole('listitem');
        expect(rows.map(r => r.querySelector('.due-name').textContent)).toEqual(['Late essay', 'Pset 4', 'Midterm']);
        expect(rows.map(r => r.querySelector('.due-days').textContent)).toEqual(['overdue', 'tomorrow', '14 days']);
        expect(rows.map(r => r.classList.contains('urgent'))).toEqual([true, true, false]);
        expect(rows[0].textContent).toContain('Mon, Sep 28 · RHE 306');
    });

    it('completes a task 5 seconds after a tap', async () => {
        const api = setup();
        await act(() => vi.advanceTimersByTimeAsync(0));
        fireEvent.click(screen.getByText('Pset 4'));
        expect(screen.getByText('Pset 4').closest('li').className).toContain('pending');
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/tasks/2', body: { done_at: new Date(NOW.getTime() + PENDING_MS).toISOString() } }]);
        expect(screen.queryByText('Pset 4')).toBeNull();
    });

    it('says when nothing is due soon', async () => {
        tasks = [task(1, { name: 'No date' })];
        setup();
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText('Nothing due in the next two weeks.')).toBeTruthy();
    });

    it('says when it could not load', async () => {
        const api = fakeServer({});
        api.failNext(500);
        api.install();
        render(<DueSoonWidget />);
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText("Couldn't load tasks.")).toBeTruthy();
    });
});
