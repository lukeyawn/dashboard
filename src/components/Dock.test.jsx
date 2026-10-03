// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dock from './Dock';

describe('Dock', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 30, 13, 35, 58));
    });
    afterEach(() => vi.useRealTimers());

    it('shows a live clock and the date', () => {
        render(<Dock />);
        expect(screen.getByText('1:35')).toBeTruthy();
        expect(screen.getByText('PM')).toBeTruthy();
        expect(screen.getByText('Wednesday, September 30')).toBeTruthy();

        act(() => vi.advanceTimersByTime(2000));
        expect(screen.getByText('1:36')).toBeTruthy();
    });

    it('shows the seconds beside the hours and minutes, ticking each second', () => {
        render(<Dock />);
        const seconds = () => document.querySelector('.dock-seconds').textContent;
        expect(seconds()).toBe('58');

        act(() => vi.advanceTimersByTime(1000));
        expect(seconds()).toBe('59');
        expect(screen.getByText('1:35')).toBeTruthy();

        act(() => vi.advanceTimersByTime(1000));
        expect(seconds()).toBe('00');
        expect(screen.getByText('1:36')).toBeTruthy();
        expect(document.querySelector('.dock-time').textContent).toBe('1:3600PM');
    });
});

describe('Dock status line', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('shows a problem from the server, and nothing when all is well', async () => {
        const { fakeServer } = await import('../testing/fakeApi');
        let problems = [{ kind: 'backup', message: 'The last backup failed (drive)' }];
        fakeServer({
            'GET /api/status': () => ({ problems }),
            'GET /api/weather': () => ({ location: {}, temperature: 70, condition: 'Clear', high: 75, low: 60 }),
        }).install();
        const { unmount } = render(<Dock />);
        expect(await screen.findByText('The last backup failed (drive)')).toBeTruthy();
        unmount();
        problems = [];
        render(<Dock />);
        await act(async () => {});
        expect(document.querySelector('.dock-problem')).toBeNull();
    });
});

describe("Dock's ✦ for the agent (docs/AGENT.md §7)", () => {
    beforeEach(() => {
        // only the date: the polls and the testing library keep real timers
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-03T15:00:00.000Z'));
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    const CHANGES = [
        { id: 9, at: '2026-10-02T12:05:00.000Z', actor: 'agent', run_id: 2, resource: 'tasks', item_id: '3', action: 'create', before: null, after: { id: 3, name: 'Book flights' } },
        { id: 7, at: '2026-10-02T12:00:00.000Z', actor: 'agent', run_id: 2, resource: 'tasks', item_id: '2', action: 'create', before: null, after: { id: 2, name: 'Reply to Stripe recruiter' } },
        { id: 4, at: '2026-10-01T12:00:00.000Z', actor: 'agent', run_id: 1, resource: 'tasks', item_id: '1', action: 'create', before: null, after: { id: 1, name: 'Seen yesterday' } },
    ];
    const RUNS = [
        { id: 2, name: 'Email', started_at: '2026-10-02T11:59:00.000Z', ended_at: '2026-10-02T12:06:00.000Z', summary: 'Two tasks', briefing: 'Book flights · reply to Stripe' },
        { id: 1, name: 'Email', started_at: '2026-10-01T11:59:00.000Z', ended_at: '2026-10-01T12:01:00.000Z', summary: 'One task', briefing: 'Seen yesterday' },
    ];

    async function setup({ seen = '2026-10-01T12:01:00.000Z', runs = RUNS, changes = CHANGES } = {}) {
        const { fakeServer } = await import('../testing/fakeApi');
        const state = { seen };
        const api = fakeServer({
            'GET /api/status': () => ({ problems: [] }),
            'GET /api/session': () => ({ client: 'api' }),
            'GET /api/settings': () => ({ week_start: 'sunday', agent_seen_at: state.seen }),
            'PATCH /api/settings': ({ body }) => {
                state.seen = body.agent_seen_at;
                return { agent_seen_at: state.seen };
            },
            // the server's since is "at or after"
            'GET /api/changes': ({ query }) => changes.filter(c => c.actor === query.get('actor') && (!query.get('since') || c.at >= query.get('since'))),
            'GET /api/runs': ({ query }) => runs.filter(r => !query.get('since') || (r.ended_at ?? r.started_at) >= query.get('since')),
        });
        api.install();
        render(<Dock />);
        return { api, state };
    }

    it("shows only the ✦ and how many things are new, none of the agent's words", async () => {
        await setup();
        const button = await screen.findByRole('button', { name: 'The agent: 2 new' });
        expect(button.textContent).toBe('✦2 new');
        expect(button.className).toBe('dock-agent new');
        expect(screen.queryByText(/Book flights/)).toBeNull();
    });

    it('is muted when nothing is new, and gone after a few quiet days', async () => {
        const { api } = await setup({ seen: '2026-10-02T12:06:00.000Z' });
        const button = await screen.findByRole('button', { name: 'The agent' });
        expect(button.className).toBe('dock-agent');
        // looking again with nothing new leaves agent_seen_at alone
        fireEvent.click(button);
        fireEvent.click(screen.getByText('Done'));
        await act(async () => {});
        expect(api.writes()).toEqual([]);
        cleanup();
        vi.setSystemTime(new Date('2026-10-06T15:00:00.000Z'));
        await setup({ seen: '2026-10-02T12:06:00.000Z' });
        await act(async () => {});
        expect(document.querySelector('.dock-agent')).toBeNull();
    });

    it('counts everything when Luke has never looked', async () => {
        const { api } = await setup({ seen: null });
        expect(await screen.findByRole('button', { name: 'The agent: 3 new' })).toBeTruthy();
        expect(api.requests.some(r => r.url === '/api/changes?actor=agent&limit=200')).toBe(true);
        expect(api.requests.some(r => r.url === '/api/runs?limit=50')).toBe(true);
    });

    it('opens the timeline, and closing it marks everything in it seen', async () => {
        const { api, state } = await setup();
        fireEvent.click(await screen.findByRole('button', { name: 'The agent: 2 new' }));
        expect(screen.getByText('Book flights · reply to Stripe')).toBeTruthy();
        expect(screen.getByText('Added task "Seen yesterday"')).toBeTruthy();
        expect(document.querySelector('.agent-seen-line')).toBeTruthy();
        fireEvent.click(screen.getByText('Done'));
        // the report came after the last change, so it's what's seen up to
        await waitFor(() => expect(state.seen).toBe('2026-10-02T12:06:00.000Z'));
        expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/settings', body: { agent_seen_at: '2026-10-02T12:06:00.000Z' } }]);
        await waitFor(() => expect(screen.getByRole('button', { name: 'The agent' }).className).toBe('dock-agent'));
    });

    it('counts a report with no changes as new, until the timeline is closed', async () => {
        const quiet = { id: 3, name: 'Email', started_at: '2026-10-03T12:00:00.000Z', ended_at: '2026-10-03T12:02:00.000Z', summary: 'Nothing new', briefing: 'A quiet day' };
        const { state } = await setup({ seen: '2026-10-02T12:06:00.000Z', runs: [quiet, ...RUNS] });
        fireEvent.click(await screen.findByRole('button', { name: 'The agent: 1 new' }));
        expect(screen.getByText('A quiet day')).toBeTruthy();
        fireEvent.click(screen.getByText('Done'));
        await waitFor(() => expect(state.seen).toBe('2026-10-03T12:02:00.000Z'));
        await waitFor(() => expect(screen.getByRole('button', { name: 'The agent' })).toBeTruthy());
    });

    it('clears "new" when Luke looks on another screen', async () => {
        const { state } = await setup();
        await screen.findByRole('button', { name: 'The agent: 2 new' });
        state.seen = '2026-10-02T12:06:00.000Z';
        await act(async () => window.dispatchEvent(new Event('focus')));
        await waitFor(() => expect(screen.getByRole('button', { name: 'The agent' })).toBeTruthy());
    });
});
