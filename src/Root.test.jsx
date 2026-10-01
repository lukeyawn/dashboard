// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
});
