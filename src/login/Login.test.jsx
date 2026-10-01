// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json } from '../testing/fakeApi';
import Login from './Login';

afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
});

function logInWith(token) {
    fireEvent.change(screen.getByLabelText('Access token'), { target: { value: token } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('Login', () => {
    it('posts the token and reports success', async () => {
        const fetch = vi.fn(async () => json(204));
        vi.stubGlobal('fetch', fetch);
        const onLogin = vi.fn();
        render(<Login onLogin={onLogin} />);
        logInWith('  my-token ');
        await waitFor(() => expect(onLogin).toHaveBeenCalled());
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ token: 'my-token' });
    });

    it("shows the server's reason when the token is wrong", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: { message: 'That token is not right', details: [] } })));
        const onLogin = vi.fn();
        render(<Login onLogin={onLogin} />);
        logInWith('wrong');
        expect((await screen.findByRole('alert')).textContent).toBe('That token is not right');
        expect(onLogin).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Log in' }).disabled).toBe(false);
    });

    it('explains a failed login link', () => {
        window.history.replaceState(null, '', '/login?failed=429');
        render(<Login onLogin={() => {}} />);
        expect(screen.getByRole('alert').textContent).toContain('Too many failed logins');
    });

    it('cannot be submitted empty', () => {
        render(<Login onLogin={() => {}} />);
        expect(screen.getByRole('button', { name: 'Log in' }).disabled).toBe(true);
    });
});
