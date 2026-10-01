// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeServer } from '../../testing/fakeApi';
import HabitsWidget from './HabitsWidget';

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0));
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function setup(habits) {
    const api = fakeServer({
        'GET /api/habits': () => habits,
        'PUT /api/habits/:id/checks/:date': ({ params }) => {
            const habit = habits.find(h => h.id === Number(params.id));
            habit.checks = [...habit.checks, params.date].sort();
            return { ...habit, streak: 9 };
        },
        'DELETE /api/habits/:id/checks/:date': ({ params }) => {
            const habit = habits.find(h => h.id === Number(params.id));
            habit.checks = habit.checks.filter(d => d !== params.date);
            return { ...habit, streak: 0 };
        },
    });
    api.install();
    render(<HabitsWidget />);
    return api;
}

describe('HabitsWidget', () => {
    it('shows the last 7 days, today last, with each streak', async () => {
        setup([{ id: 1, name: 'Read', checks: ['2026-09-29'], streak: 1, archived_at: null }]);
        await screen.findByText('Read');
        expect([...document.querySelectorAll('.habit-day-label')].map(d => d.textContent)).toEqual(['T', 'F', 'S', 'S', 'M', 'T', 'W']);
        expect(document.querySelector('.habit-day-label.today').textContent).toBe('W');
        expect(screen.getByText('1-day streak')).toBeTruthy();
        expect(screen.getByLabelText('Read, Tuesday').getAttribute('aria-pressed')).toBe('true');
    });

    it('toggles a day at once, and takes the streak from the server', async () => {
        const api = setup([{ id: 1, name: 'Read', checks: [], streak: 0, archived_at: null }]);
        await screen.findByText('Read');
        fireEvent.click(screen.getByLabelText('Read, Wednesday'));
        expect(screen.getByLabelText('Read, Wednesday').getAttribute('aria-pressed')).toBe('true');
        await act(async () => {});
        expect(screen.getByText('9-day streak')).toBeTruthy();

        fireEvent.click(screen.getByLabelText('Read, Wednesday'));
        await act(async () => {});
        expect(screen.getByText('no streak')).toBeTruthy();
        expect(api.writes().map(w => `${w.method} ${w.url}`)).toEqual([
            'PUT /api/habits/1/checks/2026-09-30?days=7',
            'DELETE /api/habits/1/checks/2026-09-30?days=7',
        ]);
    });

    it('shows when there are none', async () => {
        setup([]);
        expect(await screen.findByText('No habits yet.')).toBeTruthy();
    });
});
