// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_MS, PENDING_MS } from '../../config';
import { fakeTasksApi } from '../../testing/fakeApi';
import TasksWidget from './TasksWidget';
import { viewTasks } from './taskView';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
});

function setup(initial, options) {
    const api = fakeTasksApi(initial, options);
    api.install();
    render(<TasksWidget />);
    return api;
}

const names = () => [...document.querySelectorAll('.task-name')].map(n => n.textContent);
const choose = (menu, item) => {
    fireEvent.click(screen.getByRole('button', { name: `${menu} ▾` }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: item }));
};

describe('TasksWidget states', () => {
    it('shows loading, not "no tasks", while fetching', async () => {
        setup([]);
        expect(screen.getByText('Loading…')).toBeTruthy();
        expect(screen.queryByText('No tasks! Time to relax!')).toBeNull();
        await screen.findByText('No tasks! Time to relax!');
    });

    it('shows an error when it has never loaded', async () => {
        const api = fakeTasksApi();
        api.failNext('network');
        api.install();
        render(<TasksWidget />);
        await screen.findByText("Couldn't load tasks. Can't reach the server");
        expect(screen.queryByLabelText('New task')).toBeNull();
    });

    it('lists open tasks in order, with the add row', async () => {
        setup([{ id: 1, name: 'Do laundry' }, { id: 2, name: 'Old', done_at: '2026-09-01T00:00:00.000Z' }, { id: 3, name: 'Read' }]);
        await screen.findByText('Do laundry');
        expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Do laundry', 'Read']);
        expect(screen.getByLabelText('New task')).toBeTruthy();
    });
});

describe('the row and the order (docs/BLOCKS.md §3)', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 8, 30, 12));
    });

    it('leaves out the assignments, and orders now, soon, someday, then due date, then shortest', async () => {
        setup([
            { id: 1, name: 'Someday', priority: 'someday' },
            { id: 2, name: 'Pset', due: '2026-10-01', area_id: 1 },
            { id: 3, name: 'Quick one', priority: 'soon', minutes: 15 },
            { id: 4, name: 'Urgent', priority: 'now' },
            { id: 5, name: 'Rent', due: '2026-12-01', area_id: 4 },
            { id: 6, name: 'Read chapter 3', area_id: 1 },
        ]);
        await screen.findByText('Urgent');
        expect(names()).toEqual(['Urgent', 'Rent', 'Quick one', 'Read chapter 3', 'Someday']);
    });

    it('shows "!" for now, ↻, the due date, the time chip, and mutes someday', async () => {
        setup([
            { id: 1, name: 'Email the professor', priority: 'now', due: '2026-10-01', minutes: 15 },
            { id: 2, name: 'Pay rent', due: '2026-10-03', minutes: 5, repeat: { every: 1, unit: 'month' } },
            { id: 3, name: 'Book dentist', due: '2026-10-14', minutes: 30 },
            { id: 4, name: 'Learn dumplings', priority: 'someday', minutes: 120 },
        ]);
        await screen.findByText('Pay rent');
        const row = name => screen.getByText(name).closest('li');
        expect(row('Email the professor').querySelector('.task-now').textContent).toBe('!');
        expect(row('Pay rent').querySelector('.task-now').textContent).toBe('');
        expect(row('Pay rent').querySelector('[aria-label="repeats"]')).toBeTruthy();
        expect(row('Book dentist').querySelector('[aria-label="repeats"]')).toBeNull();
        expect([...document.querySelectorAll('.task-due')].map(d => [d.textContent, d.classList.contains('urgent')]))
            .toEqual([['tomorrow', true], ['Sat', false], ['Oct 14', false]]);
        expect([...document.querySelectorAll('.task-chip')].map(c => [c.textContent, c.className]))
            .toEqual([['15m', 'task-chip quick'], ['5m', 'task-chip quick'], ['30m', 'task-chip'], ['1h+', 'task-chip long']]);
        expect(row('Learn dumplings').className).toContain('someday');
    });

    it('puts a Someday divider before the someday tasks, in the default order only', async () => {
        setup([{ id: 1, name: 'Later', priority: 'someday' }, { id: 2, name: 'Now-ish' }]);
        await screen.findByText('Later');
        expect(screen.getByRole('separator').textContent).toBe('Someday');
        expect(screen.getByRole('separator').nextElementSibling.textContent).toContain('Later');
        choose('Sort', 'Newest');
        expect(screen.queryByRole('separator')).toBeNull();
    });

    it('folds the last rows into "+N more" when the tile is full, so someday tasks go first', async () => {
        // jsdom has no layout: the list fits 4 rows
        vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function () {
            return this.querySelectorAll('li').length * 10;
        });
        vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function () {
            return this.classList.contains('tasks-list') ? 40 : 0;
        });
        setup([1, 2, 3, 4].map(id => ({ id, name: `Task ${id}` })).concat({ id: 5, name: 'Someday', priority: 'someday' }));
        await screen.findByText('+2 more');
        expect(names()).toEqual(['Task 1', 'Task 2', 'Task 3']);
    });
});

describe('sort and filter', () => {
    const tasks = [
        { id: 1, name: 'Read chapter 3', area_id: 1, minutes: 60 },
        { id: 2, name: 'Pay rent', area_id: 4, due: '2026-10-03', minutes: 5 },
        { id: 3, name: 'Fix the door', area_id: 4, minutes: 30 },
        { id: 4, name: 'Call home', minutes: 15, priority: 'now' },
    ];

    it('sorts by priority, due date, shortest first or newest', () => {
        const sorted = sort => viewTasks([...tasks], { sort, area: null, quick: false }).map(t => t.id);
        expect(sorted('priority')).toEqual([4, 2, 3, 1]);
        expect(sorted('due')).toEqual([2, 4, 3, 1]);
        expect(sorted('shortest')).toEqual([2, 4, 3, 1]);
        expect(sorted('newest')).toEqual([4, 3, 2, 1]);
    });

    it('filters by area and "15 min or less", and says so in the header', async () => {
        setup(tasks);
        await screen.findByText('Pay rent');
        choose('Filter', 'Home');
        expect(names()).toEqual(['Pay rent', 'Fix the door']);
        expect(document.querySelector('.widget-title').textContent).toBe('Tasks · Home');
        fireEvent.click(screen.getByRole('button', { name: 'Filter ▾' }));
        fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '15 min or less' }));
        expect(names()).toEqual(['Pay rent']);
        expect(document.querySelector('.widget-title').textContent).toBe('Tasks · Home · ≤ 15 min');
        choose('Filter', 'All areas');
        expect(names()).toEqual(['Call home', 'Pay rent']);
    });

    it("filtering by the assignments area shows only its tasks without a due date", async () => {
        setup([{ id: 1, name: 'Pset', area_id: 1, due: '2026-10-01' }, { id: 2, name: 'Read chapter 3', area_id: 1 }, { id: 3, name: 'Rent', area_id: 4 }]);
        await screen.findByText('Rent');
        choose('Filter', 'School');
        expect(names()).toEqual(['Read chapter 3']);
    });

    it('says when a filter leaves nothing', async () => {
        setup([{ id: 1, name: 'Rent', area_id: 4 }]);
        await screen.findByText('Rent');
        choose('Filter', 'School');
        expect(screen.getByText('Nothing here with this filter.')).toBeTruthy();
    });

    it('keeps the choice in this browser', async () => {
        setup(tasks);
        await screen.findByText('Pay rent');
        choose('Sort', 'Newest');
        cleanup();
        setup(tasks);
        await screen.findByText('Pay rent');
        expect(names()).toEqual(['Call home', 'Fix the door', 'Pay rent', 'Read chapter 3']);
    });

    it('shows every area when the filtered one has been deleted', async () => {
        localStorage.setItem('tasks-view', JSON.stringify({ sort: 'priority', area: 9, quick: false }));
        setup(tasks);
        await screen.findByText('Pay rent');
        expect(names()).toHaveLength(4);
        expect(document.querySelector('.widget-title').textContent).toBe('Tasks');
    });

    it('goes back to the default on the kiosk after 5 minutes idle', async () => {
        vi.useFakeTimers();
        setup(tasks, { client: 'kiosk' });
        await act(() => vi.advanceTimersByTimeAsync(0));
        choose('Filter', 'Home');
        expect(names()).toHaveLength(2);
        await act(() => vi.advanceTimersByTimeAsync(IDLE_MS));
        expect(names()).toHaveLength(4);
        expect(document.querySelector('.widget-title').textContent).toBe('Tasks');
    });

    it('stays filtered elsewhere', async () => {
        vi.useFakeTimers();
        setup(tasks);
        await act(() => vi.advanceTimersByTimeAsync(0));
        choose('Filter', 'Home');
        await act(() => vi.advanceTimersByTimeAsync(IDLE_MS));
        expect(names()).toHaveLength(2);
    });
});

describe('clearing a task', () => {
    it('waits 5 seconds, then marks it done and removes it from view', async () => {
        const api = setup([{ id: 1, name: 'Do laundry' }]);
        const checkbox = await screen.findByRole('checkbox');
        vi.useFakeTimers();
        fireEvent.click(checkbox);
        expect(checkbox.checked).toBe(true);
        expect(screen.getByRole('listitem').className).toContain('pending');
        expect(api.writes()).toEqual([]);

        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/tasks/1', body: { done_at: expect.stringMatching(/Z$/) } }]);
        expect(screen.queryByText('Do laundry')).toBeNull();
        expect(screen.getByText('No tasks! Time to relax!')).toBeTruthy();
    });

    it('is cancelled by tapping again, and sends nothing', async () => {
        const api = setup([{ id: 1, name: 'Do laundry' }]);
        const row = await screen.findByText('Do laundry');
        vi.useFakeTimers();
        fireEvent.click(row);
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS - 1000));
        fireEvent.click(row);
        expect(screen.getByRole('checkbox').checked).toBe(false);
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS * 2));
        expect(api.writes()).toEqual([]);
        expect(screen.getByText('Do laundry')).toBeTruthy();
    });

    it('comes back with a message if saving fails', async () => {
        const api = setup([{ id: 1, name: 'Do laundry' }]);
        const row = await screen.findByText('Do laundry');
        vi.useFakeTimers();
        fireEvent.click(row);
        api.failNext(500);
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        expect(screen.getByText('Do laundry')).toBeTruthy();
        expect(screen.getByRole('status').textContent).toBe("Couldn't save. Failed with 500");
    });
});

describe('adding a task', () => {
    it('adds it at the bottom and clears the field', async () => {
        const api = setup([{ id: 1, name: 'First' }]);
        const input = await screen.findByLabelText('New task');
        fireEvent.change(input, { target: { value: '  Buy milk ' } });
        fireEvent.submit(input);
        await screen.findByText('Buy milk');
        expect(api.writes()).toEqual([{ method: 'POST', url: '/api/tasks', body: { name: 'Buy milk' } }]);
        expect(input.value).toBe('');
        expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['First', 'Buy milk']);
    });

    it('ignores a blank name', async () => {
        const api = setup([]);
        const input = await screen.findByLabelText('New task');
        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.submit(input);
        expect(api.writes()).toEqual([]);
    });

    it('keeps the text when saving fails', async () => {
        const api = setup([]);
        const input = await screen.findByLabelText('New task');
        api.failNext('network');
        fireEvent.change(input, { target: { value: 'Buy milk' } });
        fireEvent.submit(input);
        await screen.findByRole('status');
        expect(input.value).toBe('Buy milk');
        await waitFor(() => expect(screen.getByRole('status').textContent).toContain("Can't reach the server"));
    });
});

describe('TasksWidget and Claude', () => {
    it("marks a task Claude added, and tapping the mark doesn't tick it", async () => {
        const api = setup([
            { id: 1, name: 'From a chat', claude_change: { id: 9, at: '2026-10-01T14:00:00.000Z', actor: 'claude', via: 'claude.ai' } },
            { id: 2, name: 'Mine' },
        ]);
        await screen.findByText('From a chat');
        expect(screen.getAllByLabelText(/^Added by/)).toHaveLength(1);
        fireEvent.click(screen.getByLabelText('Added by Claude (claude.ai)'));
        expect(screen.getByRole('dialog', { name: 'Added by Claude' })).toBeTruthy();
        expect(screen.getAllByRole('checkbox').every(box => !box.checked)).toBe(true);
        expect(api.writes()).toEqual([]);
    });
});
