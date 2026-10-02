// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_MS } from '../../config';
import { fakeServer } from '../../testing/fakeApi';
import AssignmentsWidget from './AssignmentsWidget';
import { daysLabel, dueLabel } from './daysLabel';

const NOW = new Date(2026, 8, 30, 12, 0);
const SCHOOL = 1;
let tasks;
let settings;
const task = (id, fields) => ({ id, done_at: null, due: null, priority: 'soon', minutes: null, area_id: SCHOOL, area: 'School', ...fields });

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    settings = { assignments_area: SCHOOL };
    tasks = [
        task(1, { name: 'Late essay', due: '2026-09-28' }),
        task(2, { name: 'Pset 4', due: '2026-10-01' }),
        task(3, { name: 'Midterm', due: '2026-10-14' }),
        task(4, { name: 'Final paper', due: '2026-12-01' }),
        task(5, { name: 'Read chapter 3' }),
        task(6, { name: 'Pay rent', due: '2026-10-01', area_id: 4, area: 'Home' }),
    ];
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function setup() {
    const api = fakeServer({
        'GET /api/tasks': () => tasks.filter(t => !t.done_at),
        'GET /api/settings': () => settings,
        'PATCH /api/tasks/:id': ({ params, body }) => Object.assign(tasks.find(t => t.id === Number(params.id)), body),
    });
    api.install();
    render(<AssignmentsWidget />);
    return api;
}

const names = () => [...document.querySelectorAll('.assignment-name')].map(n => n.textContent);

describe('the labels', () => {
    it('count days until due', () => {
        expect([-1, 0, 1, 2, 30].map(daysLabel)).toEqual(['overdue', 'today', 'tomorrow', '2 days', '30 days']);
    });

    it('read a due date as a Tasks row does: a weekday within 6 days, then the date', () => {
        const label = due => dueLabel('2026-09-30', due);
        expect(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-06', '2026-10-07', '2027-01-14'].map(label))
            .toEqual(['overdue', 'today', 'tomorrow', 'Fri', 'Tue', 'Oct 7', 'Jan 14']);
    });
});

describe('AssignmentsWidget', () => {
    it("lists the assignments area's tasks with a due date, nearest first, with no cutoff, marking the urgent ones", async () => {
        setup();
        await act(() => vi.advanceTimersByTimeAsync(0));
        const rows = screen.getAllByRole('listitem');
        expect(names()).toEqual(['Late essay', 'Pset 4', 'Midterm', 'Final paper']);
        expect(rows.map(r => r.querySelector('.assignment-days').textContent)).toEqual(['overdue', 'tomorrow', '14 days', '62 days']);
        expect(rows.map(r => r.classList.contains('urgent'))).toEqual([true, true, false, false]);
        expect(rows[0].textContent).toContain('Mon, Sep 28');
    });

    it('follows the setting to another area', async () => {
        settings = { assignments_area: 4 };
        setup();
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(names()).toEqual(['Pay rent']);
    });

    it('asks for an area when the chosen one is gone', async () => {
        settings = { assignments_area: null };
        setup();
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText('Pick an area for Assignments in Settings.')).toBeTruthy();
    });

    it('folds what does not fit into "+N more"', async () => {
        // jsdom has no layout: the list fits 3 rows
        vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function () {
            return this.querySelectorAll('li').length * 10;
        });
        vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function () {
            return this.classList.contains('assignment-list') ? 30 : 0;
        });
        setup();
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(names()).toEqual(['Late essay', 'Pset 4']);
        expect(screen.getByText('+2 more')).toBeTruthy();
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

    it('says when nothing is due', async () => {
        tasks = [task(1, { name: 'No date' })];
        setup();
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText('No assignments due.')).toBeTruthy();
    });

    it('says when it could not load the tasks, or the setting', async () => {
        fakeServer({ 'GET /api/settings': () => settings }).install();
        const { unmount } = render(<AssignmentsWidget />);
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText("Couldn't load assignments.")).toBeTruthy();
        unmount();
        fakeServer({ 'GET /api/tasks': () => tasks }).install();
        render(<AssignmentsWidget />);
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText("Couldn't load assignments.")).toBeTruthy();
    });
});

describe('AssignmentsWidget and Claude', () => {
    it('marks an assignment Claude added, beside its row', async () => {
        tasks[1].claude_change = { id: 9, at: '2026-09-30T14:00:00.000Z', actor: 'claude', via: 'claude-code' };
        setup();
        await act(async () => {});
        expect(screen.getAllByLabelText('Added by Claude Code')).toHaveLength(1);
        expect(screen.getByLabelText('Added by Claude Code').closest('li').textContent).toContain('Pset 4');
    });
});
