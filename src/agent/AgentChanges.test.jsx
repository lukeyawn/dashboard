// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeServer, json } from '../testing/fakeApi';
import AgentChanges from './AgentChanges';

afterEach(() => vi.unstubAllGlobals());

const CHANGES = [
    { id: 9, at: '2026-10-02T12:05:00.000Z', actor: 'agent', via: 'claude.ai', resource: 'applications', item_id: '3', action: 'update',
        before: { id: 3, company: 'Stripe', role: 'Intern', status: 'applied' }, after: { id: 3, company: 'Stripe', role: 'Intern', status: 'oa' } },
    { id: 7, at: '2026-10-02T12:00:00.000Z', actor: 'agent', via: 'claude.ai', resource: 'tasks', item_id: '2', action: 'create',
        before: null, after: { id: 2, name: 'Reply to Stripe recruiter' } },
];

function setup({ undo, since } = {}) {
    const api = fakeServer({
        'POST /api/changes/:id/undo': () => undo ?? { undone: 7, item: null },
        'POST /api/changes/undo-since': () => since ?? { undone: [CHANGES[0]], skipped: [{ change: CHANGES[1], reason: 'changed since' }] },
    });
    api.install();
    const onClose = vi.fn();
    render(<AgentChanges changes={CHANGES} onClose={onClose} />);
    return { api, onClose };
}

describe("the agent's changes", () => {
    it('lists each change in words', () => {
        setup();
        expect(screen.getByRole('dialog', { name: '✦ New from the agent' })).toBeTruthy();
        expect(screen.getByText('Added task "Reply to Stripe recruiter"')).toBeTruthy();
        expect(screen.getByText('Moved application "Stripe · Intern" to OA')).toBeTruthy();
    });

    it('undoes one, and marks it undone', async () => {
        const { api } = setup();
        fireEvent.click(screen.getAllByText('Undo')[1]);
        expect(await screen.findByText('Undone')).toBeTruthy();
        expect(api.writes()).toEqual([{ method: 'POST', url: '/api/changes/7/undo', body: undefined }]);
        expect(screen.getAllByText('Undo')).toHaveLength(1);
    });

    it("says why one couldn't be undone", async () => {
        setup({ undo: json(409, { error: { message: 'It has changed since.', details: [] } }) });
        fireEvent.click(screen.getAllByText('Undo')[0]);
        expect((await screen.findByRole('status')).textContent).toBe('Couldn\'t undo "Moved application "Stripe · Intern" to OA". It has changed since.');
    });

    it("undoes all of the agent's on a second tap, from the oldest listed, naming what Luke has changed since", async () => {
        const { api } = setup();
        fireEvent.click(screen.getByText('Undo all of these'));
        expect(api.writes()).toEqual([]);
        fireEvent.click(screen.getByText('Tap again to undo them all'));
        expect((await screen.findByRole('status')).textContent).toBe('Undid 1 change. Couldn\'t undo 1: Added task "Reply to Stripe recruiter" (changed since)');
        expect(api.writes()[0]).toMatchObject({ url: '/api/changes/undo-since', body: { since: '2026-10-02T12:00:00.000Z', actors: ['agent'] } });
        expect(screen.getAllByText('Undone')).toHaveLength(1);
    });

    it('hides Undo all once everything is undone, and closes with Done', async () => {
        const { onClose } = setup({ since: { undone: CHANGES, skipped: [] } });
        fireEvent.click(screen.getByText('Undo all of these'));
        fireEvent.click(screen.getByText('Tap again to undo them all'));
        await waitFor(() => expect(screen.getAllByText('Undone')).toHaveLength(2));
        expect(screen.queryByText('Undo all of these')).toBeNull();
        fireEvent.click(screen.getByText('Done'));
        expect(onClose).toHaveBeenCalled();
    });
});
