// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PENDING_MS } from '../../config';
import { fakeServer } from '../../testing/fakeApi';
import GoalsWidget from './GoalsWidget';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function setup(goals) {
    const api = fakeServer({
        'GET /api/goals': () => goals,
        'POST /api/goals/:id/increment': ({ params, body }) => {
            const goal = goals.find(g => g.id === Number(params.id));
            goal.current = Math.max(0, goal.current + body.by);
            return { ...goal };
        },
    });
    api.install();
    render(<GoalsWidget />);
    return api;
}

const goal = (id, name, current, target, unit = null) => ({ id, name, current, target, unit, archived_at: null });

describe('GoalsWidget', () => {
    it('shows progress, a ✓ for finished goals, and at most 4', async () => {
        setup([goal(1, 'Books', 7, 12, 'books'), goal(2, 'Miles', 64.5, 100, 'mi'), goal(3, 'Apps', 40, 40), goal(4, 'd', 0, 1), goal(5, 'e', 0, 1)]);
        expect(await screen.findByText('7/12 books')).toBeTruthy();
        expect(screen.getByText('64.5/100 mi')).toBeTruthy();
        expect(screen.getByLabelText('finished').closest('li').textContent).toContain('Apps');
        expect(screen.getAllByRole('listitem')).toHaveLength(4);
        expect(screen.getByText('+1 more')).toBeTruthy();
    });

    it('adds 1 at once, and offers undo for 5 seconds', async () => {
        const api = setup([goal(1, 'Books', 7, 12)]);
        await screen.findByText('7/12');
        vi.useFakeTimers();
        fireEvent.click(screen.getByLabelText('Add 1 to Books'));
        expect(screen.getByText('8/12')).toBeTruthy();
        await act(() => vi.advanceTimersByTimeAsync(0));
        fireEvent.click(screen.getByText('undo'));
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText('7/12')).toBeTruthy();
        expect(api.writes().map(w => w.body)).toEqual([{ by: 1 }, { by: -1 }]);

        fireEvent.click(screen.getByLabelText('Add 1 to Books'));
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        expect(screen.queryByText('undo')).toBeNull();
    });

    it('shows when there are none', async () => {
        setup([]);
        expect(await screen.findByText('No goals yet.')).toBeTruthy();
    });
});
