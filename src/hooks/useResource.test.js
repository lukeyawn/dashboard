// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeTasksApi } from '../testing/fakeApi';
import { useResource } from './useResource';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function setup(initial = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }], options) {
    const api = fakeTasksApi(initial);
    api.install();
    const hook = renderHook(() => useResource('tasks', options));
    return { api, ...hook };
}

const names = rows => rows.map(r => r.name);

describe('loading', () => {
    it('starts loading, then has data', async () => {
        const { result } = setup(undefined, { params: { done: false } });
        expect(result.current).toMatchObject({ loading: true, data: null, error: null });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(names(result.current.data)).toEqual(['a', 'b']);
        expect(fetch).toHaveBeenCalledWith('/api/tasks?done=false', expect.anything());
    });

    it('tells an error before any data apart from an empty list', async () => {
        const api = fakeTasksApi();
        api.failNext(500);
        api.install();
        const { result } = renderHook(() => useResource('tasks'));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.data).toBeNull();
        expect(result.current.error.message).toBe('Failed with 500');
        expect(result.current.stale).toBe(false);
    });

    it('keeps the last good data when a refetch fails, and marks it stale', async () => {
        const { api, result } = setup();
        await waitFor(() => expect(result.current.data).not.toBeNull());
        api.failNext('network');
        await act(() => result.current.refresh());
        expect(names(result.current.data)).toEqual(['a', 'b']);
        expect(result.current).toMatchObject({ stale: true, error: { status: 0 } });
        await act(() => result.current.refresh());
        expect(result.current).toMatchObject({ stale: false, error: null });
    });
});

describe('freshness', () => {
    it('polls on an interval', async () => {
        vi.useFakeTimers();
        const { api } = setup(undefined, { pollMs: 30_000 });
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(api.requests).toHaveLength(1);
        await act(() => vi.advanceTimersByTimeAsync(30_000));
        expect(api.requests).toHaveLength(2);
    });

    it('refetches when the window regains focus or becomes visible', async () => {
        const { api, result } = setup();
        await waitFor(() => expect(result.current.data).not.toBeNull());
        await act(async () => window.dispatchEvent(new Event('focus')));
        await act(async () => document.dispatchEvent(new Event('visibilitychange')));
        await waitFor(() => expect(api.requests).toHaveLength(3));
    });

    it('stops polling when unmounted', async () => {
        vi.useFakeTimers();
        const { api, unmount } = setup(undefined, { pollMs: 1000 });
        await act(() => vi.advanceTimersByTimeAsync(0));
        unmount();
        await act(() => vi.advanceTimersByTimeAsync(5000));
        expect(api.requests).toHaveLength(1);
    });

    it('drops a poll answer that was sent before a local change', async () => {
        const { result } = setup([{ id: 1, name: 'a' }]);
        await waitFor(() => expect(result.current.data).not.toBeNull());

        // hold the next poll's answer, which is read before the change
        const fakeFetch = fetch;
        let release;
        vi.stubGlobal('fetch', vi.fn(async (url, init) => {
            if ((init?.method ?? 'GET') !== 'GET') return fakeFetch(url, init);
            const before = await fakeFetch(url, init);
            await new Promise(resolve => { release = resolve; });
            return before;
        }));

        let poll;
        act(() => { poll = result.current.refresh(); });
        await waitFor(() => expect(release).toBeTypeOf('function'));
        await act(() => result.current.update(1, { name: 'changed' }));
        await act(async () => {
            release();
            await poll;
        });
        expect(result.current.data[0].name).toBe('changed');
    });
});

describe('changes', () => {
    it('update applies at once, then takes the saved row', async () => {
        const { api, result } = setup();
        await waitFor(() => expect(result.current.data).not.toBeNull());
        let saving;
        act(() => { saving = result.current.update(1, { name: 'renamed' }); });
        expect(result.current.data[0].name).toBe('renamed');
        await act(() => saving);
        expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/tasks/1', body: { name: 'renamed' } }]);
        expect(result.current.data[0]).toEqual({ id: 1, name: 'renamed', done_at: null });
    });

    it('update puts the row back and reports the error when saving fails', async () => {
        const { api, result } = setup();
        await waitFor(() => expect(result.current.data).not.toBeNull());
        api.failNext(500);
        let outcome;
        await act(async () => { outcome = await result.current.update(1, { name: 'renamed' }); });
        expect(outcome).toBeNull();
        expect(result.current.data[0].name).toBe('a');
        expect(result.current.saveError.message).toBe('Failed with 500');
    });

    it('create appends the saved row', async () => {
        const { result } = setup();
        await waitFor(() => expect(result.current.data).not.toBeNull());
        let created;
        await act(async () => { created = await result.current.create({ name: 'c' }); });
        expect(created).toEqual({ id: 3, name: 'c', done_at: null });
        expect(names(result.current.data)).toEqual(['a', 'b', 'c']);
    });

    it('create resolves to null and changes nothing when it fails', async () => {
        const { api, result } = setup();
        await waitFor(() => expect(result.current.data).not.toBeNull());
        api.failNext('network');
        let created;
        await act(async () => { created = await result.current.create({ name: 'c' }); });
        expect(created).toBeNull();
        expect(names(result.current.data)).toEqual(['a', 'b']);
        expect(result.current.saveError.status).toBe(0);
    });

    it('remove takes the row out at once, and puts it back in place if that fails', async () => {
        const { api, result } = setup();
        await waitFor(() => expect(result.current.data).not.toBeNull());
        await act(() => result.current.remove(2));
        expect(names(result.current.data)).toEqual(['a']);
        expect(api.tasks).toHaveLength(1);

        api.failNext(500);
        await act(() => result.current.remove(1));
        expect(names(result.current.data)).toEqual(['a']);

        await act(() => result.current.create({ name: 'c' }));
        api.failNext(500);
        await act(() => result.current.remove(1));
        expect(names(result.current.data)).toEqual(['a', 'c']);
    });

    it('clears a save error after the next success', async () => {
        const { api, result } = setup();
        await waitFor(() => expect(result.current.data).not.toBeNull());
        api.failNext(500);
        await act(() => result.current.update(1, { name: 'x' }));
        expect(result.current.saveError).not.toBeNull();
        await act(() => result.current.update(1, { name: 'y' }));
        expect(result.current.saveError).toBeNull();
    });
});
