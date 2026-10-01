// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PENDING_MS } from '../../config';
import { fakeTasksApi } from '../../testing/fakeApi';
import TasksWidget from './TasksWidget';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function setup(initial) {
    const api = fakeTasksApi(initial);
    api.install();
    render(<TasksWidget />);
    return api;
}

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

describe('order and marks', () => {
    it('shows tasks not due soon, by priority, with marks for high priority and quick ones', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 8, 30, 12));
        setup([
            { id: 1, name: 'Low', priority: 'low' },
            { id: 2, name: 'Due tomorrow', due: '2026-10-01' },
            { id: 3, name: 'Quick one', priority: 'normal', effort: 'quick' },
            { id: 4, name: 'Urgent', priority: 'high' },
            { id: 5, name: 'Later deadline', due: '2026-12-01' },
        ]);
        await screen.findByText('Urgent');
        expect(screen.getAllByRole('listitem').map(li => li.querySelector('.task-name').textContent)).toEqual(['Urgent', 'Later deadline', 'Quick one', 'Low']);
        expect(screen.getByLabelText('high priority').closest('li').textContent).toContain('Urgent');
        expect(screen.getByText('quick').closest('li').textContent).toContain('Quick one');
        expect(screen.getByText('Low').closest('li').className).toContain('low');
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
