// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeServer, json } from '../testing/fakeApi';
import History from './History';

afterEach(() => vi.unstubAllGlobals());

const CHANGES = [
    { id: 2, at: '2026-09-30T18:00:00.000Z', actor: 'claude', resource: 'tasks', item_id: '1', action: 'create', before: null, after: { id: 1, name: 'Buy milk' } },
    { id: 1, at: '2026-09-30T17:00:00.000Z', actor: 'owner', resource: 'tasks', item_id: '1', action: 'update', before: { id: 1, name: 'a', done_at: null }, after: { id: 1, name: 'a', done_at: 'x' } },
];

describe('History', () => {
    it('lists recent changes with who made them, and filters by who', async () => {
        const api = fakeServer({ 'GET /api/changes': ({ query }) => CHANGES.filter(c => !query.get('actor') || c.actor === query.get('actor')) });
        api.install();
        render(<History />);
        expect(await screen.findByText('Added task "Buy milk"')).toBeTruthy();
        expect(screen.getByText('Completed task "a"')).toBeTruthy();
        expect(screen.getByText(/^Claude · /)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Made by'), { target: { value: 'claude' } });
        await waitFor(() => expect(screen.queryByText('Completed task "a"')).toBeNull());
        expect(api.requests.map(r => r.url)).toContain('/api/changes?limit=50&actor=claude');
    });

    it('undoes a change, and explains when it cannot', async () => {
        let refuse = false;
        const api = fakeServer({
            'GET /api/changes': () => CHANGES,
            'POST /api/changes/:id/undo': ({ params }) => (refuse
                ? json(409, { error: { message: 'It has changed since.', details: [] } })
                : { undone: Number(params.id), item: null }),
        });
        api.install();
        render(<History />);
        await screen.findByText('Added task "Buy milk"');
        fireEvent.click(screen.getAllByText('Undo')[0]);
        expect((await screen.findByRole('status')).textContent).toBe('Undid: Added task "Buy milk"');
        expect(api.writes()).toEqual([{ method: 'POST', url: '/api/changes/2/undo', body: undefined }]);
        refuse = true;
        fireEvent.click(screen.getAllByText('Undo')[1]);
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe("Couldn't undo. It has changed since."));
    });
});
