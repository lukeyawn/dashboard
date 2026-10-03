// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeServer, json } from '../testing/fakeApi';
import Connect from './Connect';

const assign = vi.fn();
beforeEach(() => {
    assign.mockReset();
    vi.stubGlobal('location', { ...window.location, assign });
});
afterEach(() => vi.unstubAllGlobals());

const REQUEST = { connector: 'chat', access: 'Read your dashboard, and add and change tasks.', expires_at: '2026-10-01T12:05:00.000Z', same_browser: true };

function setup(request = REQUEST, answers = {}) {
    const api = fakeServer({
        'GET /api/connect/:id': () => request,
        'POST /api/connect/:id/approve': () => answers.approve ?? { redirect: 'https://claude.ai/api/mcp/auth_callback?code=abc&state=s' },
        'POST /api/connect/:id/deny': () => ({ redirect: 'https://claude.ai/api/mcp/auth_callback?error=access_denied&state=s' }),
    });
    api.install();
    render(<Connect id="req-1" />);
    return api;
}

describe('Connect', () => {
    it('shows what is asking and what it can do, and approving goes back to claude.ai', async () => {
        const api = setup();
        expect(await screen.findByText('Dashboard')).toBeTruthy();
        expect(screen.getByText(/It will be able to: Read your dashboard/)).toBeTruthy();
        fireEvent.click(screen.getByText('Approve'));
        await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=abc&state=s'));
        expect(api.writes()).toEqual([{ method: 'POST', url: '/api/connect/req-1/approve', body: undefined }]);
    });

    it('can deny', async () => {
        setup({ ...REQUEST, connector: 'agent' });
        expect(await screen.findByText('Dashboard (agent)')).toBeTruthy();
        fireEvent.click(screen.getByText('Deny'));
        await waitFor(() => expect(assign).toHaveBeenCalledWith(expect.stringContaining('error=access_denied')));
    });

    it("won't approve a sign-in started in another browser", async () => {
        setup({ ...REQUEST, same_browser: false });
        expect(await screen.findByText(/started in a different browser/)).toBeTruthy();
        expect(screen.getByText('Approve').disabled).toBe(true);
    });

    it('explains an expired sign-in, or a refusal', async () => {
        fakeServer({ 'GET /api/connect/:id': () => json(404, { error: { message: 'This sign-in has expired or was already used. Start again from claude.ai.', details: [] } }) }).install();
        render(<Connect id="old" />);
        expect((await screen.findByRole('alert')).textContent).toMatch(/expired/);
    });

    it('shows why approving failed', async () => {
        setup(REQUEST, { approve: json(409, { error: { message: 'This connector is switched off.', details: [] } }) });
        fireEvent.click(await screen.findByText('Approve'));
        expect((await screen.findByRole('alert')).textContent).toBe('This connector is switched off.');
        expect(assign).not.toHaveBeenCalled();
    });
});
