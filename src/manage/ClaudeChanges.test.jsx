// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeServer, json } from '../testing/fakeApi';
import ClaudeChanges from './ClaudeChanges';

const NOW = new Date(2026, 9, 1, 15, 0);
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const CHANGES = [
    { id: 3, at: '2026-10-01T19:00:00.000Z', actor: 'claude', via: 'claude.ai', resource: 'tasks', item_id: '2', action: 'create', before: null, after: { id: 2, name: 'Email Prof. Lee' } },
    { id: 2, at: '2026-10-01T18:00:00.000Z', actor: 'claude', via: 'claude-code', resource: 'tasks', item_id: '1', action: 'create', before: null, after: { id: 1, name: 'Laundry' } },
    { id: 1, at: '2026-09-30T18:00:00.000Z', actor: 'claude', via: 'claude.ai', resource: 'countdowns', item_id: '1', action: 'create', before: null, after: { id: 1, label: 'Finals' } },
];

function setup(answers = {}) {
    const api = fakeServer({
        'GET /api/changes': ({ query }) => CHANGES.filter(c => !query.get('via') || c.via === query.get('via')),
        'POST /api/changes/:id/undo': () => answers.undo ?? { undone: 3, item: null },
        'POST /api/changes/undo-since': () => answers.since ?? { undone: [CHANGES[0]], skipped: [{ change: CHANGES[2], reason: 'changed since' }] },
    });
    api.install();
    render(<ClaudeChanges />);
    return api;
}

describe("Claude's changes", () => {
    it("lists Claude's changes by day, saying where each came from, and filters", async () => {
        const api = setup();
        expect(await screen.findByText('Added task "Email Prof. Lee"')).toBeTruthy();
        expect(screen.getByText('Thu, Oct 1')).toBeTruthy();
        expect(screen.getByText('Wed, Sep 30')).toBeTruthy();
        expect(screen.getByText(/^Claude Code · /)).toBeTruthy();
        expect(api.requests[0].url).toBe('/api/changes?limit=100&actor=claude%2Cagent');
        fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'claude-code' } });
        await waitFor(() => expect(screen.queryByText('Added task "Email Prof. Lee"')).toBeNull());
        expect(api.requests.at(-1).url).toBe('/api/changes?limit=100&actor=claude%2Cagent&via=claude-code');
    });

    it('undoes one change, and explains when it cannot', async () => {
        const api = setup({ undo: json(409, { error: { message: 'It has changed since.', details: [] } }) });
        fireEvent.click((await screen.findAllByText('Undo'))[0]);
        expect((await screen.findByRole('status')).textContent).toBe("Couldn't undo. It has changed since.");
        expect(api.writes()[0].url).toBe('/api/changes/3/undo');
    });

    it('undoes everything from claude.ai in the last hour on a second tap, and lists what it skipped', async () => {
        const api = setup();
        await screen.findByText('Added task "Email Prof. Lee"');
        fireEvent.click(screen.getByText('Undo everything since'));
        expect(api.writes()).toEqual([]);
        fireEvent.click(screen.getByText('Tap again to undo them all'));
        expect((await screen.findByRole('status')).textContent).toBe('Undid 1 change. Couldn\'t undo 1: Added countdown "Finals" (changed since)');
        expect(api.writes()[0].body).toEqual({ since: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(), via: 'claude.ai' });
    });

    it('can cover today, a picked time, and Claude Code too', async () => {
        const api = setup({ since: { undone: [], skipped: [] } });
        await screen.findByText('Added task "Email Prof. Lee"');
        fireEvent.change(screen.getByLabelText('Since'), { target: { value: 'today' } });
        fireEvent.change(screen.getByLabelText('From'), { target: { value: 'all' } });
        fireEvent.click(screen.getByText('Undo everything since'));
        fireEvent.click(screen.getByText('Tap again to undo them all'));
        await waitFor(() => expect(api.writes()).toHaveLength(1));
        expect(api.writes()[0].body).toEqual({ since: new Date(2026, 9, 1).toISOString() });

        fireEvent.change(screen.getByLabelText('Since'), { target: { value: 'custom' } });
        fireEvent.click(screen.getByText('Undo everything since'));
        expect((await screen.findByRole('status')).textContent).toBe('Pick a time first.');
        fireEvent.change(screen.getByLabelText('Time'), { target: { value: '2026-10-01T09:30' } });
        fireEvent.click(screen.getByText('Undo everything since'));
        fireEvent.click(screen.getByText('Tap again to undo them all'));
        await waitFor(() => expect(api.writes()).toHaveLength(2));
        expect(api.writes()[1].body.since).toBe(new Date(2026, 9, 1, 9, 30).toISOString());
        expect((await screen.findByRole('status')).textContent).toBe('Undid 0 changes.');
    });

    it('says when Claude has changed nothing', async () => {
        fakeServer({ 'GET /api/changes': () => [] }).install();
        render(<ClaudeChanges />);
        expect(await screen.findByText("Claude hasn't changed anything yet.")).toBeTruthy();
    });
});
