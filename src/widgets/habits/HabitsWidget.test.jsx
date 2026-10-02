// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

function setup(habits, { weekStart = 'sunday' } = {}) {
    const api = fakeServer({
        'GET /api/habits': () => habits,
        'GET /api/settings': () => ({ night_start: '22:00', night_end: '06:30', week_start: weekStart }),
        'PUT /api/habits/:id/checks/:date': ({ params }) => {
            const habit = habits.find(h => h.id === Number(params.id));
            habit.checks = [...habit.checks, params.date].sort();
            return { ...habit, streak: 9, week_count: habit.checks.filter(d => d >= '2026-09-27').length };
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

    it("shows a weekly habit's count this week, in accent once met, and its streak in weeks", async () => {
        setup([
            { id: 1, name: 'Gym', checks: ['2026-09-28'], per_week: 2, week_count: 1, streak: 3, archived_at: null },
            { id: 2, name: 'Read', checks: [], per_week: 7, week_count: 0, streak: 0, archived_at: null },
        ]);
        await screen.findByText('Gym');
        expect(screen.getByText('1/2 this week').classList.contains('met')).toBe(false);
        expect(screen.getByText('3-week streak')).toBeTruthy();
        expect(screen.queryByText('0/7 this week')).toBeNull();

        fireEvent.click(screen.getByLabelText('Gym, Wednesday'));
        expect(screen.getByText('2/2 this week').classList.contains('met')).toBe(true);
        await act(async () => {});
        expect(screen.getByText('2/2 this week')).toBeTruthy();
    });

    it('draws the week divider before the first day of the week', async () => {
        setup([{ id: 1, name: 'Read', checks: [], per_week: 7, week_count: 0, streak: 0, archived_at: null }]);
        await screen.findByText('Read');
        await act(async () => {});
        // Thu Sep 24 … Wed Sep 30: Sunday is the 4th day, in grid column 5
        expect(document.querySelector('.habit-week-divider').style.gridColumn).toBe('5');
    });

    it('moves the divider to Monday with week_start, and leaves it out when the week starts on the leftmost day', async () => {
        setup([{ id: 1, name: 'Read', checks: [], per_week: 7, week_count: 0, streak: 0, archived_at: null }], { weekStart: 'monday' });
        await screen.findByText('Read');
        await act(async () => {});
        expect(document.querySelector('.habit-week-divider').style.gridColumn).toBe('6');

        // on Saturday Oct 3 the window is Sun Sep 27 … Sat Oct 3, so a Sunday week starts at its left edge
        vi.setSystemTime(new Date(2026, 9, 3, 12, 0));
        cleanup();
        setup([{ id: 1, name: 'Read', checks: [], per_week: 7, week_count: 0, streak: 0, archived_at: null }]);
        await screen.findByText('Read');
        await act(async () => {});
        expect(document.querySelector('.habit-week-divider')).toBeNull();
    });

    it('shows when there are none', async () => {
        setup([]);
        expect(await screen.findByText('No habits yet.')).toBeTruthy();
    });
});
