// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from '../lib/api';
import { fakeServer, json } from '../testing/fakeApi';
import { nextTimeOfDay, reloadWhenReachable, useIsKiosk, useReloadRules } from './useKiosk';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('nextTimeOfDay', () => {
    it('is later today, or tomorrow once passed', () => {
        expect(nextTimeOfDay(new Date(2026, 8, 30, 3, 0), '04:00')).toEqual(new Date(2026, 8, 30, 4, 0));
        expect(nextTimeOfDay(new Date(2026, 8, 30, 4, 0), '04:00')).toEqual(new Date(2026, 9, 1, 4, 0));
    });
});

describe('reloadWhenReachable', () => {
    it('reloads only when the server answers', async () => {
        const reload = vi.fn();
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
        await reloadWhenReachable(reload);
        vi.stubGlobal('fetch', vi.fn(async () => json(503, {})));
        await reloadWhenReachable(reload);
        expect(reload).not.toHaveBeenCalled();
        vi.stubGlobal('fetch', vi.fn(async () => json(200)));
        await reloadWhenReachable(reload);
        expect(reload).toHaveBeenCalledTimes(1);
    });
});

describe('useIsKiosk', () => {
    it('asks the server which token this browser has', async () => {
        fakeServer({ 'GET /api/session': () => ({ client: 'kiosk' }) }).install();
        const { result } = renderHook(() => useIsKiosk());
        await waitFor(() => expect(result.current).toBe(true));
    });
});

describe('useReloadRules', () => {
    // a response carrying the server's build, as any API call would
    async function serverSays(build) {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json', 'X-Build': build } })));
        await request('/anything');
    }

    it('reloads after a deploy, but only once nobody is using the screen', async () => {
        const reload = vi.fn();
        const { rerender } = renderHook(props => useReloadRules(props), { initialProps: { enabled: true, idle: false, build: 'aaa', reload } });
        await act(() => serverSays('bbb'));
        await act(async () => {});
        expect(reload).not.toHaveBeenCalled();
        rerender({ enabled: true, idle: true, build: 'aaa', reload });
        await waitFor(() => expect(reload).toHaveBeenCalled());
    });

    it('never reloads for a development build, or off the kiosk', async () => {
        const reload = vi.fn();
        renderHook(() => useReloadRules({ enabled: true, idle: true, build: 'dev', reload }));
        renderHook(() => useReloadRules({ enabled: false, idle: true, build: 'aaa', reload }));
        await act(() => serverSays('ccc'));
        await act(async () => {});
        expect(reload).not.toHaveBeenCalled();
    });

    it('reloads nightly at 04:00', async () => {
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
        vi.setSystemTime(new Date(2026, 8, 30, 3, 58));
        const reload = vi.fn();
        await act(() => serverSays('same'));
        vi.stubGlobal('fetch', vi.fn(async () => json(200)));
        renderHook(() => useReloadRules({ enabled: true, idle: false, build: 'same', reload }));
        await act(() => vi.advanceTimersByTimeAsync(60_000));
        expect(reload).not.toHaveBeenCalled();
        await act(() => vi.advanceTimersByTimeAsync(60_000));
        expect(reload).toHaveBeenCalled();
    });
});
