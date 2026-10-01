// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeServer } from '../../testing/fakeApi';
import CalendarWidget from './CalendarWidget';

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0));
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

it('shows today and dots days with a task due, a countdown or a birthday', async () => {
    const api = fakeServer({
        'GET /api/tasks': () => [{ id: 1, due: '2026-09-28', done_at: null }, { id: 2, due: null, done_at: null }],
        'GET /api/countdowns': () => [{ id: 1, target_date: '2026-09-15' }],
        'GET /api/birthdays': () => [{ id: 'm', date: '2026-09-03' }],
    });
    api.install();
    render(<CalendarWidget />);
    expect(screen.getByText('Wednesday')).toBeTruthy();
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(document.querySelector('.calendar-cell.today').dataset.date).toBe('2026-09-30');
    await waitFor(() => expect([...document.querySelectorAll('.marked')].map(c => c.dataset.date)).toEqual(['2026-09-03', '2026-09-15', '2026-09-28']));
    expect(api.requests.map(r => r.url)).toContain('/api/birthdays?from=2026-09-01&to=2026-09-30');
});
