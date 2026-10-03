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

describe("Dock's chip for the agent's changes", () => {
    afterEach(() => vi.unstubAllGlobals());

    const CHANGES = [
        { id: 9, at: '2026-10-02T12:05:00.000Z', actor: 'agent', resource: 'tasks', item_id: '3', action: 'create', before: null, after: { id: 3, name: 'Book flights' } },
        { id: 7, at: '2026-10-02T12:00:00.000Z', actor: 'agent', resource: 'tasks', item_id: '2', action: 'create', before: null, after: { id: 2, name: 'Reply to Stripe recruiter' } },
        { id: 4, at: '2026-10-01T12:00:00.000Z', actor: 'agent', resource: 'tasks', item_id: '1', action: 'create', before: null, after: { id: 1, name: 'Seen yesterday' } },
    ];

    async function setup(seen = '2026-10-01T12:00:00.000Z') {
        const { fakeServer } = await import('../testing/fakeApi');
        const state = { seen };
        const api = fakeServer({
            'GET /api/status': () => ({ problems: [] }),
            'GET /api/settings': () => ({ week_start: 'sunday', agent_seen_at: state.seen }),
            'PATCH /api/settings': ({ body }) => {
                state.seen = body.agent_seen_at;
                return { agent_seen_at: state.seen };
            },
            // the server's since is "at or after"
            'GET /api/changes': ({ query }) => CHANGES.filter(c => c.actor === query.get('actor') && (!query.get('since') || c.at >= query.get('since'))),
        });
        api.install();
        render(<Dock />);
        return { api, state };
    }

    it("counts the agent's changes since Luke last looked, and shows nothing when there are none", async () => {
        await setup();
        expect(await screen.findByText('✦ 2 new from the agent')).toBeTruthy();
        cleanup();
        await setup('2026-10-02T12:05:00.000Z');
        await act(async () => {});
        expect(document.querySelector('.dock-agent')).toBeNull();
    });

    it('counts every change when Luke has never looked', async () => {
        const { api } = await setup(null);
        expect(await screen.findByText('✦ 3 new from the agent')).toBeTruthy();
        expect(api.requests.some(r => r.url === '/api/changes?actor=agent&limit=200')).toBe(true);
    });

    it('opens the changes, and closing them marks them seen, up to the newest shown', async () => {
        const { api, state } = await setup();
        fireEvent.click(await screen.findByText('✦ 2 new from the agent'));
        expect(screen.getByText('Added task "Book flights"')).toBeTruthy();
        expect(screen.queryByText('Added task "Seen yesterday"')).toBeNull();
        fireEvent.click(screen.getByText('Done'));
        expect(document.querySelector('.dock-agent')).toBeNull();
        await waitFor(() => expect(state.seen).toBe('2026-10-02T12:05:00.000Z'));
        expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/settings', body: { agent_seen_at: '2026-10-02T12:05:00.000Z' } }]);
        await act(async () => {});
        expect(document.querySelector('.dock-agent')).toBeNull();
    });

    it('clears when Luke looks on another screen', async () => {
        const { state } = await setup();
        await screen.findByText('✦ 2 new from the agent');
        state.seen = '2026-10-02T12:05:00.000Z';
        await act(async () => window.dispatchEvent(new Event('focus')));
        await waitFor(() => expect(document.querySelector('.dock-agent')).toBeNull());
    });
});
