// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
        'POST /api/goals/:id/achieve': ({ params }) => {
            const goal = goals.find(g => g.id === Number(params.id));
            goal.archived_at = '2026-10-01T17:00:00.000Z';
            return { ...goal };
        },
    });
    api.install();
    render(<GoalsWidget />);
    return api;
}

const goal = (id, name, current, target, unit = null, fields = {}) => ({
    id, name, current, target, unit, archived_at: null, kind: 'progress', step: 1, deadline: null, started: '2026-09-01', week_gain: 0, dream: false, ...fields,
});
const milestone = (id, name, fields = {}) => ({ id, name, kind: 'milestone', current: null, target: null, unit: null, step: null, deadline: null, archived_at: null, dream: false, week_gain: null, ...fields });

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

// docs/BLOCKS.md §5; today is Thu, Oct 1, 2026
describe('deadlines, steps, milestones and dreams', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 9, 1, 12));
    });

    it('marks where steady progress would be today, and turns amber more than 10% behind', async () => {
        setup([
            goal(1, 'Behind', 10, 100, null, { started: '2026-09-01', deadline: '2026-10-31' }),
            goal(2, 'On pace', 45, 100, null, { started: '2026-09-01', deadline: '2026-10-31' }),
            goal(3, 'No deadline', 5, 100),
        ]);
        await screen.findByText('Behind');
        const row = name => screen.getByText(name).closest('li');
        expect(row('Behind').className).toContain('behind');
        expect(row('On pace').className).not.toContain('behind');
        expect(row('Behind').querySelector('.progress-tick').style.left).toBe('50%');
        expect(row('Behind').textContent).toContain('4 wk left');
        expect(row('No deadline').querySelector('.progress-tick')).toBeNull();
        expect(row('No deadline').querySelector('.goal-meta')).toBeNull();
    });

    it("adds the goal's step, and undo takes the same off", async () => {
        const api = setup([goal(1, 'Pages', 40, 300, 'pages', { step: 10 }), goal(2, 'Run', 3, 50, 'km', { step: 0.5 })]);
        await screen.findByText('Pages');
        expect(screen.getByText('+0.5')).toBeTruthy();
        vi.useFakeTimers();
        fireEvent.click(screen.getByLabelText('Add 10 to Pages'));
        expect(screen.getByText('50/300 pages')).toBeTruthy();
        await act(() => vi.advanceTimersByTimeAsync(0));
        fireEvent.click(screen.getByText('undo'));
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(api.writes().map(w => w.body)).toEqual([{ by: 10 }, { by: -10 }]);
    });

    it('shows this week\'s progress, but not when it is 0', async () => {
        setup([goal(1, 'Pages', 40, 300, null, { week_gain: 20 }), goal(2, 'Books', 2, 12, null, { week_gain: 0 })]);
        await screen.findByText('Pages');
        expect(screen.getByText('Pages').closest('li').querySelector('.goal-meta').textContent).toBe('+20 this week');
        expect(screen.getByText('Books').closest('li').textContent).not.toContain('this week');
    });

    it('shows a milestone with its deadline, done 5 seconds after a tap, or cancelled by a second', async () => {
        const api = setup([milestone(1, 'Internship offer', { deadline: '2026-12-31' }), milestone(2, 'Driving test')]);
        await screen.findByText('Internship offer');
        const row = screen.getByText('Internship offer').closest('li');
        expect(row.querySelector('.goal-meta').textContent).toBe('by Dec 31 · 3 mo left');
        expect(row.querySelector('.progress-track')).toBeNull();
        vi.useFakeTimers();
        fireEvent.click(screen.getByLabelText('Driving test is done'));
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS - 1000));
        fireEvent.click(screen.getByLabelText('Driving test is done'));
        fireEvent.click(screen.getByLabelText('Internship offer is done'));
        expect(screen.getByText('Internship offer').closest('li').className).toContain('pending');
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        expect(api.writes()).toEqual([{ method: 'POST', url: '/api/goals/1/achieve', body: undefined }]);
        expect(screen.queryByText('Internship offer')).toBeNull();
        expect(screen.getByText('Driving test')).toBeTruthy();
    });

    it('leaves dreams off the tile', async () => {
        const api = setup([goal(1, 'Books', 2, 12), milestone(2, 'See the northern lights', { dream: true })]);
        await screen.findByText('Books');
        expect(screen.queryByText('See the northern lights')).toBeNull();
        expect(api.requests[0].url).toBe('/api/goals?archived=false&dream=false');
    });
});
