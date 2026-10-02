// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dock from './Dock';

describe('Dock', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 30, 13, 35, 58));
    });
    afterEach(() => vi.useRealTimers());

    it('shows a live clock and the date', () => {
        render(<Dock />);
        expect(screen.getByText('1:35')).toBeTruthy();
        expect(screen.getByText('PM')).toBeTruthy();
        expect(screen.getByText('Wednesday, September 30')).toBeTruthy();

        act(() => vi.advanceTimersByTime(2000));
        expect(screen.getByText('1:36')).toBeTruthy();
    });

    it('shows the seconds beside the hours and minutes, ticking each second', () => {
        render(<Dock />);
        const seconds = () => document.querySelector('.dock-seconds').textContent;
        expect(seconds()).toBe('58');

        act(() => vi.advanceTimersByTime(1000));
        expect(seconds()).toBe('59');
        expect(screen.getByText('1:35')).toBeTruthy();

        act(() => vi.advanceTimersByTime(1000));
        expect(seconds()).toBe('00');
        expect(screen.getByText('1:36')).toBeTruthy();
        expect(document.querySelector('.dock-time').textContent).toBe('1:3600PM');
    });
});

describe('Dock status line', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('shows a problem from the server, and nothing when all is well', async () => {
        const { fakeServer } = await import('../testing/fakeApi');
        let problems = [{ kind: 'backup', message: 'The last backup failed (drive)' }];
        fakeServer({
            'GET /api/status': () => ({ problems }),
            'GET /api/weather': () => ({ location: {}, temperature: 70, condition: 'Clear', high: 75, low: 60 }),
        }).install();
        const { unmount } = render(<Dock />);
        expect(await screen.findByText('The last backup failed (drive)')).toBeTruthy();
        unmount();
        problems = [];
        render(<Dock />);
        await act(async () => {});
        expect(document.querySelector('.dock-problem')).toBeNull();
    });
});
