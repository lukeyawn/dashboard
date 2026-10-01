import { afterEach, describe, expect, it, vi } from 'vitest';
import { json } from '../testing/fakeApi';
import { ApiError, logIn, onUnauthorized, query, request } from './api';

afterEach(() => vi.unstubAllGlobals());

function respondWith(response) {
    const fetch = vi.fn(async () => (typeof response === 'function' ? response() : response));
    vi.stubGlobal('fetch', fetch);
    return fetch;
}

describe('request', () => {
    it('returns parsed JSON and sends JSON bodies', async () => {
        const fetch = respondWith(json(201, { id: 1 }));
        await expect(request('/tasks', { method: 'POST', body: { name: 'x' } })).resolves.toEqual({ id: 1 });
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe('/api/tasks');
        expect(init).toMatchObject({ method: 'POST', body: '{"name":"x"}', credentials: 'same-origin' });
        expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('returns null for 204', async () => {
        respondWith(json(204));
        await expect(request('/tasks/1', { method: 'DELETE' })).resolves.toBeNull();
    });

    it("turns the server's error shape into an ApiError", async () => {
        respondWith(json(400, { error: { message: 'Invalid request', details: [{ path: 'name' }] } }));
        const error = await request('/tasks').catch(e => e);
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 400, message: 'Invalid request', details: [{ path: 'name' }] });
    });

    it('copes with an error that is not JSON', async () => {
        respondWith(new Response('Bad Gateway', { status: 502 }));
        await expect(request('/tasks')).rejects.toMatchObject({ status: 502, message: 'The server answered 502' });
    });

    it('reports a network failure as status 0', async () => {
        respondWith(() => { throw new TypeError('Failed to fetch'); });
        await expect(request('/tasks')).rejects.toMatchObject({ status: 0, message: "Can't reach the server" });
    });

    it('lets an abort through unchanged', async () => {
        respondWith(() => { throw new DOMException('Aborted', 'AbortError'); });
        await expect(request('/tasks')).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('tells listeners about a 401 until they unsubscribe', async () => {
        respondWith(() => json(401, { error: { message: 'Log in first', details: [] } }));
        const listener = vi.fn();
        const unsubscribe = onUnauthorized(listener);
        await expect(request('/tasks')).rejects.toMatchObject({ status: 401 });
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        await expect(request('/tasks')).rejects.toMatchObject({ status: 401 });
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe('query', () => {
    it('builds a query string, skipping undefined values', () => {
        expect(query({ done: false, from: '2026-09-30', skip: undefined })).toBe('?done=false&from=2026-09-30');
        expect(query()).toBe('');
        expect(query({ skip: undefined })).toBe('');
    });
});

describe('logIn', () => {
    it('posts the token', async () => {
        const fetch = respondWith(json(204));
        await logIn('secret');
        expect(fetch.mock.calls[0][0]).toBe('/api/login');
        expect(fetch.mock.calls[0][1].body).toBe('{"token":"secret"}');
    });
});
