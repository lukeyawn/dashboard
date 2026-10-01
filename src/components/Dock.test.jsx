// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dock from './Dock';

describe('Dock', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 30, 13, 35, 58));
    });
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('shows a live clock and the date', () => {
        render(<Dock />);
        expect(screen.getByText('1:35')).toBeTruthy();
        expect(screen.getByText('PM')).toBeTruthy();
        expect(screen.getByText('Wednesday, September 30')).toBeTruthy();

        act(() => vi.advanceTimersByTime(2000));
        expect(screen.getByText('1:36')).toBeTruthy();
    });
});
