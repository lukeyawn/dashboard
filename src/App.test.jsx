// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { IDLE_MS } from './config';
import { fakeServer } from './testing/fakeApi';

let night;
let api;
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    night = { active: true, early: false, until: '2026-10-01T11:30:00.000Z', start: '22:00', end: '06:30' };
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function setup(client) {
    api = fakeServer({
        'GET /api/session': () => ({ client }),
        'GET /api/night': () => night,
        'POST /api/night/start': () => (night = { ...night, active: true, early: true }),
        'POST /api/night/cancel': () => (night = { ...night, active: false, early: false }),
        'GET /api/tasks': () => [{ id: 1, name: 'Do laundry', done_at: null }],
        'GET /api/deadlines': () => [],
        'GET /api/countdowns': () => [],
        'GET /api/birthdays': () => [],
        'GET /api/events': () => [],
        'GET /api/goals': () => [],
        'GET /api/habits': () => [],
        'GET /api/applications': () => [],
        'GET /api/weather': () => ({ location: { name: null }, temperature: 70, condition: 'Clear', high: 75, low: 60, report_location: false }),
    });
    api.install();
    render(<App />);
}

const overlay = () => document.querySelector('.night-overlay');

describe('night mode on the kiosk', () => {
    it('goes dark after 5 idle minutes, and the waking tap only dismisses the dark', async () => {
        setup('kiosk');
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(overlay()).toBeNull();
        await act(() => vi.advanceTimersByTimeAsync(IDLE_MS));
        expect(overlay()).not.toBeNull();

        // a tap in the dark, over the task, doesn't tick it
        fireEvent.pointerDown(overlay());
        fireEvent.click(overlay());
        expect(overlay()).toBeNull();
        expect(screen.getByRole('checkbox').checked).toBe(false);
        expect(api.writes()).toEqual([]);

        await act(() => vi.advanceTimersByTimeAsync(IDLE_MS));
        expect(overlay()).not.toBeNull();
    });

    it('stays lit outside night hours', async () => {
        night = { ...night, active: false, until: null };
        setup('kiosk');
        await act(() => vi.advanceTimersByTimeAsync(IDLE_MS * 2));
        expect(overlay()).toBeNull();
    });

    it('goes dark at once with the moon button, and the moon cancels it', async () => {
        night = { ...night, active: false, until: null };
        setup('kiosk');
        await act(() => vi.advanceTimersByTimeAsync(0));
        fireEvent.click(screen.getByLabelText('Start night mode now'));
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(overlay()).not.toBeNull();
        fireEvent.click(overlay());
        fireEvent.click(screen.getByLabelText('Cancel night mode'));
        await act(() => vi.advanceTimersByTimeAsync(IDLE_MS));
        expect(overlay()).toBeNull();
        expect(api.writes().map(w => w.url)).toEqual(['/api/night/start', '/api/night/cancel']);
    });
});

it('never darkens a screen that is not the kiosk', async () => {
    setup('api');
    await act(() => vi.advanceTimersByTimeAsync(IDLE_MS * 2));
    expect(overlay()).toBeNull();
});
