// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from '../lib/api';
import { json } from '../testing/fakeApi';
import { useOfflineSince } from './useConnection';

afterEach(() => vi.unstubAllGlobals());

describe('useOfflineSince', () => {
    it('records when requests stopped getting through, and clears when they do', async () => {
        const { result } = renderHook(() => useOfflineSince());
        expect(result.current).toBeNull();

        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        await act(() => request('/tasks').catch(() => {}));
        const since = result.current;
        expect(since).toBeInstanceOf(Date);

        // a second failure keeps the first time
        await act(() => request('/tasks').catch(() => {}));
        expect(result.current).toBe(since);

        // any answer, even an error, means the server is reachable
        vi.stubGlobal('fetch', vi.fn(async () => json(500, {})));
        await act(() => request('/tasks').catch(() => {}));
        expect(result.current).toBeNull();
    });
});
