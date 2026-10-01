// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePendingAction } from './usePendingAction';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('usePendingAction', () => {
    it('runs the action once the delay is over', () => {
        const action = vi.fn();
        const { result } = renderHook(() => usePendingAction(action, 5000));
        act(() => result.current.toggle(7));
        expect(result.current.isPending(7)).toBe(true);
        act(() => vi.advanceTimersByTime(4999));
        expect(action).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(1));
        expect(action).toHaveBeenCalledWith(7);
        expect(result.current.isPending(7)).toBe(false);
    });

    it('cancels when toggled again, without running the action', () => {
        const action = vi.fn();
        const { result } = renderHook(() => usePendingAction(action, 5000));
        act(() => result.current.toggle(7));
        act(() => vi.advanceTimersByTime(3000));
        act(() => result.current.toggle(7));
        expect(result.current.isPending(7)).toBe(false);
        act(() => vi.advanceTimersByTime(10_000));
        expect(action).not.toHaveBeenCalled();
    });

    it('keeps separate timers for separate items', () => {
        const action = vi.fn();
        const { result } = renderHook(() => usePendingAction(action, 5000));
        act(() => result.current.toggle(1));
        act(() => vi.advanceTimersByTime(2000));
        act(() => result.current.toggle(2));
        act(() => vi.advanceTimersByTime(3000));
        expect(action.mock.calls).toEqual([[1]]);
        expect(result.current.isPending(2)).toBe(true);
        act(() => vi.advanceTimersByTime(2000));
        expect(action.mock.calls).toEqual([[1], [2]]);
    });

    it('uses the newest action, even one passed after the tap', () => {
        const first = vi.fn();
        const second = vi.fn();
        const { result, rerender } = renderHook(({ action }) => usePendingAction(action, 5000), { initialProps: { action: first } });
        act(() => result.current.toggle(1));
        rerender({ action: second });
        act(() => vi.advanceTimersByTime(5000));
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledWith(1);
    });

    it('drops pending actions when unmounted', () => {
        const action = vi.fn();
        const { result, unmount } = renderHook(() => usePendingAction(action, 5000));
        act(() => result.current.toggle(1));
        unmount();
        act(() => vi.advanceTimersByTime(5000));
        expect(action).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});
