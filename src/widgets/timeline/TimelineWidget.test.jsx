// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeServer } from '../../testing/fakeApi';
import TimelineWidget from './TimelineWidget';

const at = time => new Date(`2026-09-30T${time}:00-05:00`).toISOString();

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T13:35:00-05:00'));
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function setup(events, birthdays = []) {
    const api = fakeServer({ 'GET /api/events': () => events, 'GET /api/birthdays': () => birthdays });
    api.install();
    render(<TimelineWidget />);
    return api;
}

describe('TimelineWidget', () => {
    it("marks past, current and upcoming events, with chips for all-day ones and today's birthdays", async () => {
        const api = setup([
            { id: 'f', title: 'Career fair', start: '2026-09-30', end: '2026-09-30', all_day: true },
            { id: 'a', title: 'Lecture', start: at('09:00'), end: at('10:15'), all_day: false, location: 'GDC 2.216' },
            { id: 'b', title: 'OS', start: at('13:00'), end: at('14:30'), all_day: false },
            { id: 'c', title: 'Gym', start: at('16:30'), end: at('17:30'), all_day: false },
        ], [{ id: 'mom', title: "Mom's birthday", date: '2026-09-30' }]);
        await screen.findByText('Lecture');
        expect([...document.querySelectorAll('.chip')].map(c => c.textContent)).toEqual(['Career fair', "Mom's birthday"]);
        expect([...document.querySelectorAll('.timeline-event')].map(e => e.className.split(' ')[1])).toEqual(['past', 'current', 'upcoming']);
        expect(screen.getByText('9:00 AM')).toBeTruthy();
        expect(screen.getByText('GDC 2.216')).toBeTruthy();
        expect(api.requests[0].url).toBe('/api/events?from=2026-09-30&to=2026-09-30');
    });

    it('says when nothing is scheduled', async () => {
        setup([]);
        expect(await screen.findByText('Nothing scheduled today.')).toBeTruthy();
    });
});
