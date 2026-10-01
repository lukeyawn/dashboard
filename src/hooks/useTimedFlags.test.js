// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimedFlags } from './useTimedFlags';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useTimedFlags', () => {
    it('shows a flag for the given time', () => {
        const { result } = renderHook(() => useTimedFlags(5000));
        act(() => result.current.show(1));
        expect(result.current.isShown(1)).toBe(true);
        act(() => vi.advanceTimersByTime(5000));
        expect(result.current.isShown(1)).toBe(false);
    });

    it('restarts the time when shown again', () => {
        const { result } = renderHook(() => useTimedFlags(5000));
        act(() => result.current.show(1));
        act(() => vi.advanceTimersByTime(4000));
        act(() => result.current.show(1));
        act(() => vi.advanceTimersByTime(4000));
        expect(result.current.isShown(1)).toBe(true);
    });

    it('can be hidden early, and stops its timers when unmounted', () => {
        const { result, unmount } = renderHook(() => useTimedFlags(5000));
        act(() => result.current.show(1));
        act(() => result.current.hide(1));
        expect(result.current.isShown(1)).toBe(false);
        act(() => result.current.show(2));
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});
