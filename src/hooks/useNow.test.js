// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNow } from './useNow.js';

describe('useNow', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 30, 23, 59, 30));
    });
    afterEach(() => vi.useRealTimers());

    it('ticks at the given interval', () => {
        const { result } = renderHook(() => useNow(1000));
        expect(result.current.getSeconds()).toBe(30);
        act(() => vi.advanceTimersByTime(1000));
        expect(result.current.getSeconds()).toBe(31);
    });

    it('rolls over to the next day', () => {
        const { result } = renderHook(() => useNow());
        expect(result.current.getDate()).toBe(30);
        act(() => vi.advanceTimersByTime(60_000));
        expect(result.current.getDate()).toBe(1);
    });

    it('stops ticking when unmounted', () => {
        const { unmount } = renderHook(() => useNow(1000));
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});
