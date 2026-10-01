// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json } from './testing/fakeApi';
import Root from './Root';

afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
});

describe('Root', () => {
    it('switches to the login screen when the server refuses a request', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: { message: 'Log in first', details: [] } })));
        render(<Root />);
        expect(await screen.findByLabelText('Access token')).toBeTruthy();
    });

    it('shows the login screen at /login', () => {
        vi.stubGlobal('fetch', vi.fn(async () => json(200, [])));
        window.history.replaceState(null, '', '/login');
        render(<Root />);
        expect(screen.getByLabelText('Access token')).toBeTruthy();
    });

    it('shows the approval page at /connect/<id>, and stays there after logging in', async () => {
        let loggedIn = false;
        vi.stubGlobal('fetch', vi.fn(async url => {
            if (url === '/api/login') {
                loggedIn = true;
                return json(204);
            }
            return loggedIn
                ? json(200, { connector: 'chat', access: 'Read your dashboard.', expires_at: 'x', same_browser: true })
                : json(401, { error: { message: 'Log in first', details: [] } });
        }));
        window.history.replaceState(null, '', '/connect/req-1');
        render(<Root />);
        fireEvent.change(await screen.findByLabelText('Access token'), { target: { value: 'token' } });
        fireEvent.click(screen.getByText('Log in'));
        expect(await screen.findByText('Connect claude.ai')).toBeTruthy();
        expect(await screen.findByText(/It will be able to/)).toBeTruthy();
        expect(window.location.pathname).toBe('/connect/req-1');
    });
});

