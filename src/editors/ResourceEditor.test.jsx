// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeServer } from '../testing/fakeApi';
import { ApplicationsEditor, AreasEditor, CountdownsEditor, DreamsEditor, GoalsEditor, TasksEditor } from './editors';

let rows;
let nextId;
beforeEach(() => {
    nextId = 10;
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

// the task areas (docs/BLOCKS.md §3)
let areas;
beforeEach(() => {
    areas = [{ id: 1, name: 'School', position: 0 }, { id: 4, name: 'Home', position: 1 }];
});

// like the server, which fills in what a create leaves out
function serve(resource, initial, defaults = {}) {
    rows = initial;
    const api = fakeServer({
        'GET /api/areas': () => areas,
        'POST /api/areas': ({ body }) => {
            const found = areas.find(a => a.name.toLowerCase() === body.name.toLowerCase());
            if (found) return found;
            const area = { id: 20, name: body.name, position: areas.length };
            areas = [...areas, area];
            return area;
        },
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
// a task as the server returns it
const task = (id, fields) => ({ id, name: `task ${id}`, done_at: null, due: null, priority: 'soon', area_id: null, area: null, minutes: null, repeat: null, notes: null, link: null, source: null, ...fields });
const addForm = () => document.querySelector('.editor-add');

describe('adding', () => {
    it('adds an item and clears the form', async () => {
        const api = serve('tasks', []);
        render(<TasksEditor />);
        await screen.findByText('Nothing here yet.');
        fireEvent.change(field(addForm(), 'Task'), { target: { value: 'Buy milk' } });
        fireEvent.click(screen.getByText('Add task'));
        await screen.findByText('Buy milk');
        expect(api.writes()).toEqual([{ method: 'POST', url: '/api/tasks', body: { name: 'Buy milk', priority: 'soon' } }]);
        expect(field(addForm(), 'Task').value).toBe('');
    });

    it('checks the values with the shared schema before sending', async () => {
        const api = serve('tasks', []);
        render(<TasksEditor />);
        await screen.findByText('Nothing here yet.');
        fireEvent.change(field(addForm(), 'Task'), { target: { value: '   ' } });
        fireEvent.click(screen.getByText('Add task'));
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
        expect(api.writes()[0].body).toEqual({ kind: 'progress', name: 'Books', current: 0, target: 12, unit: null, deadline: null });
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
        const api = serve('tasks', [task(1, { name: 'Pset 4', due: '2026-10-01', area_id: 1, area: 'School', minutes: 45 })]);
        render(<TasksEditor />);
        await screen.findByText('Pset 4');
        fireEvent.click(screen.getByText('Edit'));
        const form = document.querySelector('.editor-item .editor-form');
        // Claude's 45 minutes isn't one of the choices, and is kept
        expect(field(form, 'Time it takes').value).toBe('45');
        fireEvent.change(field(form, 'Due'), { target: { value: '2026-10-02' } });
        fireEvent.click(within(form).getByText('Now'));
        fireEvent.click(within(form).getByText('Save'));
        await waitFor(() => expect(document.querySelector('.editor-item .editor-form')).toBeNull());
        expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/tasks/1', body: { due: '2026-10-02', priority: 'now' } }]);
    });

    it('clears an optional detail with an empty value', async () => {
        const api = serve('tasks', [task(1, { minutes: 15, area_id: 4, area: 'Home' })]);
        render(<TasksEditor />);
        await screen.findByText('task 1');
        fireEvent.click(screen.getByText('Edit'));
        const form = document.querySelector('.editor-item .editor-form');
        await waitFor(() => expect(within(form).getByRole('combobox', { name: 'Area' }).value).toBe('4'));
        fireEvent.change(field(form, 'Time it takes'), { target: { value: '' } });
        fireEvent.change(within(form).getByRole('combobox', { name: 'Area' }), { target: { value: '' } });
        fireEvent.click(within(form).getByText('Save'));
        await waitFor(() => expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/tasks/1', body: { area_id: null, minutes: null } }]));
    });

    it('closes without a request when nothing changed', async () => {
        const api = serve('tasks', [task(1, { name: 'Same' })]);
        render(<TasksEditor />);
        await screen.findByText('Same');
        fireEvent.click(screen.getByText('Edit'));
        fireEvent.click(screen.getByText('Save'));
        expect(document.querySelector('.editor-item .editor-form')).toBeNull();
        expect(api.writes()).toEqual([]);
    });

    it('restores a completed task, and archives a goal', async () => {
        const api = serve('tasks', [task(1, { name: 'Old', done_at: '2026-09-01T00:00:00.000Z' })]);
        render(<TasksEditor />);
        await screen.findByText('Completed');
        fireEvent.click(screen.getByText('Restore'));
        await waitFor(() => expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/tasks/1', body: { done_at: null } }]));
    });
});

describe('deleting', () => {
    it('takes two taps within 4 seconds', async () => {
        const api = serve('tasks', [task(1, { name: 'Gone soon' })]);
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

describe('filtering and sorting', () => {
    it('narrows the list by a detail, and re-sorts it', async () => {
        serve('tasks', [
            task(1, { name: 'Laundry', area: 'Home' }),
            task(2, { name: 'Pset', area: 'School', priority: 'now' }),
            task(3, { name: 'Dishes', area: 'Home', due: '2026-10-01' }),
        ]);
        render(<TasksEditor />);
        await screen.findByText('Laundry');
        const names = () => [...document.querySelectorAll('.editor-title')].map(e => e.textContent);
        const toolbar = within(document.querySelector('.editor-toolbar'));
        expect(names()).toEqual(['Pset', 'Dishes', 'Laundry']);
        fireEvent.change(toolbar.getByLabelText('Area'), { target: { value: 'Home' } });
        expect(names()).toEqual(['Dishes', 'Laundry']);
        fireEvent.change(toolbar.getByLabelText('Sort'), { target: { value: '2' } });
        expect(names()).toEqual(['Dishes', 'Laundry']);
        fireEvent.change(toolbar.getByLabelText('Area'), { target: { value: '' } });
        expect(names()).toEqual(['Dishes', 'Pset', 'Laundry']);
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

describe('countdowns (docs/BLOCKS.md §4)', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 8, 30, 12, 0));
    });

    const countdown = (id, fields) => ({ id, label: `countdown ${id}`, target_date: '2026-12-10', target_time: null, detail: 'days', pinned: false, ...fields });

    it('says beside the date that it has passed, and sends nothing', async () => {
        const api = serve('countdowns', []);
        render(<CountdownsEditor />);
        await screen.findByText('Nothing here yet.');
        fireEvent.change(field(addForm(), 'Counting down to'), { target: { value: 'New Years!' } });
        fireEvent.change(field(addForm(), 'Date'), { target: { value: '2026-01-01' } });
        fireEvent.click(screen.getByText('Add countdown'));
        expect(await within(addForm()).findByText('That date has passed (Jan 1, 2026). Did you mean 2027?')).toBeTruthy();
        expect(api.writes()).toEqual([]);
    });

    it('adds a live countdown with a time, chosen from three buttons', async () => {
        const api = serve('countdowns', []);
        render(<CountdownsEditor />);
        await screen.findByText('Nothing here yet.');
        fireEvent.change(field(addForm(), 'Counting down to'), { target: { value: 'Flight' } });
        fireEvent.change(field(addForm(), 'Date'), { target: { value: '2026-10-02' } });
        fireEvent.click(within(addForm()).getByText('Live'));
        fireEvent.click(screen.getByText('Add countdown'));
        expect(await within(addForm()).findByText('Hours and live need a time.')).toBeTruthy();
        fireEvent.change(field(addForm(), 'Time'), { target: { value: '14:00' } });
        fireEvent.click(screen.getByText('Add countdown'));
        await screen.findByText('Flight');
        expect(api.writes()[0].body).toEqual({ label: 'Flight', target_date: '2026-10-02', target_time: '14:00', detail: 'live', pinned: false });
        expect(screen.getByText('Fri, Oct 2, 2026 · 2:00 PM · live')).toBeTruthy();
    });

    it('asks the server for the past ones under Past', async () => {
        const api = serve('countdowns', [countdown(1, { label: 'Finals' })]);
        render(<CountdownsEditor />);
        await screen.findByText('Finals');
        fireEvent.click(screen.getByText('Past'));
        await act(async () => {});
        expect(api.requests.map(r => r.url)).toContain('/api/countdowns?past=true');
    });
});

describe('task areas, time and repeating (docs/BLOCKS.md §3)', () => {
    const addField = label => within(addForm()).getByRole('combobox', { name: label });

    it('adds a task in a new area, and picks an existing one when the name matches', async () => {
        const api = serve('tasks', []);
        render(<TasksEditor />);
        await screen.findByText('Nothing here yet.');
        await waitFor(() => expect(within(addField('Area')).getByText('Home')).toBeTruthy());
        fireEvent.change(field(addForm(), 'Task'), { target: { value: 'Practice scales' } });
        fireEvent.change(addField('Area'), { target: { value: 'new' } });
        fireEvent.change(within(addForm()).getByLabelText('New area'), { target: { value: 'Music' } });
        fireEvent.click(within(addForm()).getByText('Add area'));
        await waitFor(() => expect(addField('Area').value).toBe('20'));
        fireEvent.change(addField('Time it takes'), { target: { value: '120' } });
        fireEvent.click(screen.getByText('Add task'));
        await screen.findByText('Practice scales');
        expect(api.writes().map(w => [w.method, w.url, w.body])).toEqual([
            ['POST', '/api/areas', { name: 'Music' }],
            ['POST', '/api/tasks', { name: 'Practice scales', priority: 'soon', area_id: 20, minutes: 120 }],
        ]);

        // "home" finds Home instead of adding a second one
        fireEvent.change(addField('Area'), { target: { value: 'new' } });
        fireEvent.change(within(addForm()).getByLabelText('New area'), { target: { value: 'home' } });
        fireEvent.click(within(addForm()).getByText('Add area'));
        await waitFor(() => expect(addField('Area').value).toBe('4'));
    });

    it('sets a repeat rule, which needs a due date', async () => {
        const api = serve('tasks', []);
        render(<TasksEditor />);
        await screen.findByText('Nothing here yet.');
        fireEvent.change(field(addForm(), 'Task'), { target: { value: 'Laundry' } });
        fireEvent.change(addField('Repeats'), { target: { value: 'week' } });
        fireEvent.change(within(addForm()).getByLabelText('Every how many'), { target: { value: '2' } });
        fireEvent.click(within(addForm()).getByLabelText('Sunday'));
        expect(within(addForm()).getByText('every 2 weeks on Sun, from the due date')).toBeTruthy();
        fireEvent.click(screen.getByText('Add task'));
        expect(await within(addForm()).findByText('A recurring task needs a due date')).toBeTruthy();
        fireEvent.change(field(addForm(), 'Due'), { target: { value: '2026-10-04' } });
        fireEvent.click(screen.getByText('Add task'));
        await screen.findByText('Laundry');
        expect(api.writes()[0].body).toEqual({ name: 'Laundry', due: '2026-10-04', priority: 'soon', repeat: { every: 2, unit: 'week', weekdays: [0] } });
        expect(screen.getByText('due Sun, Oct 4, 2026 · every 2 weeks on Sun')).toBeTruthy();
    });

    it('moves an area up or down the list', async () => {
        const api = serve('areas', [{ id: 1, name: 'School', position: 0 }, { id: 4, name: 'Home', position: 1 }]);
        render(<AreasEditor />);
        await screen.findByText('Home');
        const rowOf = name => screen.getByText(name).closest('.editor-row');
        expect(within(rowOf('School')).queryByText('↑')).toBeNull();
        expect(within(rowOf('Home')).queryByText('↓')).toBeNull();
        fireEvent.click(within(rowOf('Home')).getByText('↑'));
        await waitFor(() => expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/areas/4', body: { position: 0 } }]));
    });
});

describe('goals, milestones and dreams (docs/BLOCKS.md §5)', () => {
    const goal = (id, fields) => ({ id, name: `goal ${id}`, kind: 'progress', current: 0, target: 10, unit: null, step: 1, deadline: null, started: '2026-09-01', achieved_at: null, archived_at: null, dream: false, ...fields });

    it('adds a milestone without a count, and a progress goal with a step and a deadline', async () => {
        const api = serve('goals', []);
        render(<GoalsEditor />);
        await screen.findByText('Nothing here yet.');
        fireEvent.click(within(addForm()).getByRole('button', { name: 'Milestone' }));
        expect(within(addForm()).queryByLabelText('Target', { exact: false })).toBeNull();
        fireEvent.change(field(addForm(), 'Goal'), { target: { value: 'Internship offer' } });
        fireEvent.change(field(addForm(), 'Deadline'), { target: { value: '2026-12-31' } });
        fireEvent.click(screen.getByText('Add goal'));
        await screen.findByText('Internship offer');
        expect(api.writes()[0].body).toEqual({ kind: 'milestone', name: 'Internship offer', deadline: '2026-12-31' });

        fireEvent.click(within(addForm()).getByRole('button', { name: 'Progress' }));
        fireEvent.change(field(addForm(), 'Goal'), { target: { value: 'Pages' } });
        fireEvent.change(field(addForm(), 'Target'), { target: { value: '300' } });
        fireEvent.change(field(addForm(), 'Each + adds'), { target: { value: '10' } });
        fireEvent.click(screen.getByText('Add goal'));
        await waitFor(() => expect(api.writes()[1].body).toEqual({ kind: 'progress', name: 'Pages', current: 0, target: 300, unit: null, step: 10, deadline: null }));
    });

    it("edits a milestone's name and deadline only", async () => {
        serve('goals', [goal(1, { name: 'Offer', kind: 'milestone', current: null, target: null, step: null })]);
        render(<GoalsEditor />);
        fireEvent.click(await screen.findByText('Edit'));
        const form = document.querySelector('.editor-item .editor-form');
        expect([...form.querySelectorAll('.editor-label')].map(l => l.firstChild.textContent)).toEqual(['Goal', 'Deadline']);
    });

    it('adds dreams on their own, and makes one a goal', async () => {
        const api = serve('goals', [goal(1, { name: 'Northern lights', kind: 'milestone', current: null, target: null, step: null, dream: true })]);
        render(<DreamsEditor />);
        await screen.findByText('Northern lights');
        expect(api.requests[0].url).toBe('/api/goals?dream=true');
        fireEvent.click(screen.getByText('Make it a goal'));
        await waitFor(() => expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/goals/1', body: { dream: false } }]));
        fireEvent.click(within(addForm()).getByRole('button', { name: 'Milestone' }));
        fireEvent.change(field(addForm(), 'Goal'), { target: { value: 'Learn to sail' } });
        fireEvent.click(screen.getByText('Add dream'));
        await waitFor(() => expect(api.writes()[1].body).toEqual({ kind: 'milestone', name: 'Learn to sail', dream: true }));
    });
});
