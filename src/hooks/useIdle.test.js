// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdle } from './useIdle';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useIdle', () => {
    it('turns idle after the time with no touch, and a touch restarts the time', () => {
        const { result } = renderHook(() => useIdle(1000));
        act(() => vi.advanceTimersByTime(900));
        act(() => window.dispatchEvent(new Event('pointerdown')));
        act(() => vi.advanceTimersByTime(900));
        expect(result.current.idle).toBe(false);
        act(() => vi.advanceTimersByTime(100));
        expect(result.current.idle).toBe(true);
        act(() => window.dispatchEvent(new Event('keydown')));
        expect(result.current.idle).toBe(false);
    });

    it('ignores touches on elements that wake the page themselves', () => {
        const overlay = document.createElement('div');
        overlay.dataset.ignoreIdle = '';
        document.body.append(overlay);
        const { result } = renderHook(() => useIdle(1000));
        act(() => vi.advanceTimersByTime(1000));
        act(() => overlay.dispatchEvent(new Event('pointerdown', { bubbles: true })));
        expect(result.current.idle).toBe(true);
        act(() => result.current.wake());
        expect(result.current.idle).toBe(false);
        overlay.remove();
    });

    it('stops listening when unmounted', () => {
        const { unmount } = renderHook(() => useIdle(1000));
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});
