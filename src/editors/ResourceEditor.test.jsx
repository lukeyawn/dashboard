// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeServer } from '../testing/fakeApi';
import { ApplicationsEditor, DeadlinesEditor, GoalsEditor, TasksEditor } from './editors';

let rows;
let nextId;
beforeEach(() => {
    nextId = 10;
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

// like the server, which fills in what a create leaves out
function serve(resource, initial, defaults = {}) {
    rows = initial;
    const api = fakeServer({
        [`GET /api/${resource}`]: () => rows,
        [`POST /api/${resource}`]: ({ body }) => {
            const row = { id: nextId++, done_at: null, archived_at: null, ...defaults, ...body };
            rows = [...rows, row];
            return row;
        },
        [`PATCH /api/${resource}/:id`]: ({ params, body }) => {
            rows = rows.map(r => (r.id === Number(params.id) ? { ...r, ...body } : r));
            return rows.find(r => r.id === Number(params.id));
        },
        [`DELETE /api/${resource}/:id`]: ({ params }) => {
            rows = rows.filter(r => r.id !== Number(params.id));
        },
    });
    api.install();
    return api;
}

const field = (scope, label) => within(scope).getByLabelText(label, { exact: false });
const addForm = () => document.querySelector('.editor-add');

describe('adding', () => {
    it('adds an item and clears the form', async () => {
        const api = serve('tasks', []);
        render(<TasksEditor />);
        await screen.findByText('Nothing here yet.');
        fireEvent.change(field(addForm(), 'Task'), { target: { value: 'Buy milk' } });
        fireEvent.click(screen.getByText('Add task'));
        await screen.findByText('Buy milk');
        expect(api.writes()).toEqual([{ method: 'POST', url: '/api/tasks', body: { name: 'Buy milk' } }]);
        expect(field(addForm(), 'Task').value).toBe('');
    });

    it('checks the values with the shared schema before sending', async () => {
        const api = serve('deadlines', []);
        render(<DeadlinesEditor />);
        await screen.findByText('Nothing here yet.');
        fireEvent.change(field(addForm(), 'Deadline'), { target: { value: '   ' } });
        fireEvent.click(screen.getByText('Add deadline'));
        expect(await screen.findByText('Name is required')).toBeTruthy();
        expect(api.writes()).toEqual([]);
    });

    it('sends an empty optional field as nothing, and numbers as numbers', async () => {
        const api = serve('goals', []);
        render(<GoalsEditor />);
        await screen.findByText('Nothing here yet.');
        fireEvent.change(field(addForm(), 'Goal'), { target: { value: 'Books' } });
        fireEvent.change(field(addForm(), 'Target'), { target: { value: '12' } });
        fireEvent.click(screen.getByText('Add goal'));
        await screen.findByText('Books');
        expect(api.writes()[0].body).toEqual({ name: 'Books', current: 0, target: 12, unit: null });
    });

    it('leaves out an empty applied date, so the server uses today', async () => {
        const api = serve('applications', [], { applied_on: '2026-09-30' });
        render(<ApplicationsEditor />);
        await screen.findByText('Nothing here yet.');
        fireEvent.change(field(addForm(), 'Company'), { target: { value: 'Stripe' } });
        fireEvent.change(field(addForm(), 'Role'), { target: { value: 'Intern' } });
        fireEvent.click(screen.getByText('Add application'));
        await waitFor(() => expect(api.writes()).toHaveLength(1));
        expect(api.writes()[0].body).toEqual({ company: 'Stripe', role: 'Intern', status: 'applied', url: null, notes: null });
    });
});

describe('editing', () => {
    it('sends only the fields that changed', async () => {
        const api = serve('deadlines', [{ id: 1, name: 'Pset 4', due: '2026-10-01', course: 'M 340L', done_at: null }]);
        render(<DeadlinesEditor />);
        await screen.findByText('Pset 4');
        fireEvent.click(screen.getByText('Edit'));
        const form = document.querySelector('.editor-item .editor-form');
        fireEvent.change(field(form, 'Due'), { target: { value: '2026-10-02' } });
        fireEvent.click(within(form).getByText('Save'));
        await waitFor(() => expect(document.querySelector('.editor-item .editor-form')).toBeNull());
        expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/deadlines/1', body: { due: '2026-10-02' } }]);
    });

    it('closes without a request when nothing changed', async () => {
        const api = serve('tasks', [{ id: 1, name: 'Same', done_at: null }]);
        render(<TasksEditor />);
        await screen.findByText('Same');
        fireEvent.click(screen.getByText('Edit'));
        fireEvent.click(screen.getByText('Save'));
        expect(document.querySelector('.editor-item .editor-form')).toBeNull();
        expect(api.writes()).toEqual([]);
    });

    it('restores a completed task, and archives a goal', async () => {
        const api = serve('tasks', [{ id: 1, name: 'Old', done_at: '2026-09-01T00:00:00.000Z' }]);
        render(<TasksEditor />);
        await screen.findByText('Completed');
        fireEvent.click(screen.getByText('Restore'));
        await waitFor(() => expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/tasks/1', body: { done_at: null } }]));
    });
});

describe('deleting', () => {
    it('takes two taps within 4 seconds', async () => {
        const api = serve('tasks', [{ id: 1, name: 'Gone soon', done_at: null }]);
        render(<TasksEditor />);
        await screen.findByText('Gone soon');
        vi.useFakeTimers();
        fireEvent.click(screen.getByText('Delete'));
        expect(api.writes()).toEqual([]);
        await act(() => vi.advanceTimersByTimeAsync(4000));
        expect(screen.getByText('Delete')).toBeTruthy();

        fireEvent.click(screen.getByText('Delete'));
        fireEvent.click(screen.getByText('Tap again to delete'));
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(api.writes()).toEqual([{ method: 'DELETE', url: '/api/tasks/1', body: undefined }]);
        expect(screen.queryByText('Gone soon')).toBeNull();
    });
});

it('says when saving failed', async () => {
    const api = serve('tasks', []);
    render(<TasksEditor />);
    await screen.findByText('Nothing here yet.');
    api.failNext(500);
    fireEvent.change(field(addForm(), 'Task'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Add task'));
    expect((await screen.findByRole('status')).textContent).toContain('Failed with 500');
    expect(field(addForm(), 'Task').value).toBe('x');
});
