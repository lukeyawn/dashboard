// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeServer } from '../testing/fakeApi';
import Claude from './Claude';

afterEach(() => vi.unstubAllGlobals());

function setup({ configured = true } = {}) {
    let enabled = true;
    const connections = [
        { id: 2, connector: 'chat', created_at: '2026-10-01T14:00:00.000Z', last_used_at: '2026-10-01T15:00:00.000Z', ended_at: null, end_reason: null, end_reason_text: null },
        { id: 1, connector: 'chat', created_at: '2026-09-01T14:00:00.000Z', last_used_at: null, ended_at: '2026-09-30T14:00:00.000Z', end_reason: 'expired', end_reason_text: 'Unused for 30 days' },
    ];
    const api = fakeServer({
        'GET /api/connectors': () => [
            { name: 'chat', configured, enabled, url: configured ? 'https://dashboard.test:8443/mcp' : null, writes_today: 34, write_cap: 100 },
            { name: 'agent', configured: false, enabled: true, url: null },
        ],
        'PUT /api/connectors/:name': ({ body }) => {
            enabled = body.enabled;
            if (!enabled) connections[0] = { ...connections[0], ended_at: '2026-10-01T16:00:00.000Z', end_reason: 'switched_off', end_reason_text: 'You switched the connector off' };
            return {};
        },
        'GET /api/connections': () => connections,
        'POST /api/connections/:id/revoke': () => null,
        'GET /api/changes': () => [],
    });
    api.install();
    render(<Claude />);
    return api;
}

describe('Claude on /manage', () => {
    it("shows each set-up connector with its address and today's count, and the connections", async () => {
        setup();
        expect(await screen.findByText('claude.ai chats: on')).toBeTruthy();
        expect(screen.getByText(/https:\/\/dashboard\.test:8443\/mcp · 34 of 100 changes today/)).toBeTruthy();
        expect(screen.queryByText(/The agent/)).toBeNull();
        expect(await screen.findByText(/^Connected Oct 1/)).toBeTruthy();
        expect(screen.getByText('Unused for 30 days')).toBeTruthy();
    });

    it('switches off only on a second tap, then back on at once', async () => {
        const api = setup();
        fireEvent.click(await screen.findByText('Switch off'));
        expect(api.writes()).toEqual([]);
        fireEvent.click(screen.getByText('Tap again to switch off'));
        expect((await screen.findByRole('status')).textContent).toMatch(/switched off, and every connection revoked/);
        expect(api.writes()).toEqual([{ method: 'PUT', url: '/api/connectors/chat', body: { enabled: false } }]);
        fireEvent.click(await screen.findByText('Switch on'));
        await waitFor(() => expect(api.writes()).toHaveLength(2));
        expect(api.writes()[1].body).toEqual({ enabled: true });
    });

    it('revokes a connection on a second tap', async () => {
        const api = setup();
        fireEvent.click(await screen.findByText('Revoke'));
        fireEvent.click(screen.getByText('Tap again to revoke'));
        await waitFor(() => expect(api.writes()).toEqual([{ method: 'POST', url: '/api/connections/2/revoke', body: undefined }]));
    });

    it('says when the connector is not set up', async () => {
        setup({ configured: false });
        expect(await screen.findByText('claude.ai chats: not set up')).toBeTruthy();
        expect(screen.queryByText(/changes today/)).toBeNull();
        expect(screen.queryByText('Switch off')).toBeNull();
    });
});
