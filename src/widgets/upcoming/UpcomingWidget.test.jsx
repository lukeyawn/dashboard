// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeServer } from '../../testing/fakeApi';
import UpcomingWidget from './UpcomingWidget';

// Friday Oct 30, 2026, so the four days run over the month's end, and over
// the clock change on Sunday Nov 1
const at = (day, hour, minute = 0) => new Date(2026, day > 20 ? 9 : 10, day, hour, minute).toISOString();
const timed = (id, title, start, extra = {}) => ({ id, title, start, end: start, all_day: false, routine: false, ...extra });

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 30, 12, 0));
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function setup({ events = [], birthdays = [] } = {}) {
    const api = fakeServer({
        'GET /api/events': () => events,
        'GET /api/birthdays': () => birthdays,
    });
    api.install();
    render(<UpcomingWidget />);
    return api;
}

const day = date => document.querySelector(`.upcoming-day[data-date="${date}"]`);
const texts = (el, selector) => [...el.querySelectorAll(selector)].map(e => e.textContent);

describe('UpcomingWidget', () => {
    it('shows the 4 days after today, starting tomorrow, across a month end', async () => {
        const api = setup();
        await waitFor(() => expect(document.querySelectorAll('.upcoming-day')).toHaveLength(4));
        expect([...document.querySelectorAll('.upcoming-day')].map(d => d.dataset.date)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
        expect(texts(day('2026-11-01'), '.upcoming-date span')).toEqual(['Sun', 'Nov 1']);
        expect(api.requests.map(r => r.url)).toContain('/api/events?from=2026-10-31&to=2026-11-03');
        expect(api.requests.map(r => r.url)).toContain('/api/birthdays?from=2026-10-31&to=2026-11-03');
    });

    it('puts events on their days, with all-day events and birthdays as chips, and leaves out classes', async () => {
        setup({
            events: [
                { id: 'trip', title: 'Trip', start: '2026-10-31', end: '2026-11-01', all_day: true, routine: false },
                timed('tutor', 'Tutoring', at(2, 16)),
                timed('lecture', 'Algorithms lecture', at(2, 9), { routine: true }),
                timed('party', 'Halloween party', at(31, 20, 30)),
            ],
            birthdays: [{ id: 'mom', title: "Mom's birthday", date: '2026-11-01' }],
        });
        await screen.findByText('Tutoring');
        expect(texts(day('2026-10-31'), '.chip')).toEqual(['Trip']);
        expect(texts(day('2026-11-01'), '.chip')).toEqual(['Trip', "Mom's birthday"]);
        expect(texts(day('2026-10-31'), '.upcoming-event')).toEqual(['8:30 PMHalloween party']);
        expect(texts(day('2026-11-02'), '.upcoming-event')).toEqual(['4:00 PMTutoring']);
        expect(screen.queryByText('Algorithms lecture')).toBeNull();
    });

    it('dims an empty day instead of hiding it', async () => {
        setup({ events: [timed('tutor', 'Tutoring', at(2, 16))] });
        await screen.findByText('Tutoring');
        expect([...document.querySelectorAll('.upcoming-day.empty')].map(d => d.dataset.date)).toEqual(['2026-10-31', '2026-11-01', '2026-11-03']);
    });

    it('folds the last events of a full day into "+N"', async () => {
        // a day's box fits 4 rows here; jsdom has no layout, so heights come from the rows
        vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function () {
            return this.querySelectorAll('li').length * 10;
        });
        vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function () {
            return this.classList.contains('upcoming-body') ? 40 : 0;
        });
        setup({ events: [9, 10, 11, 12, 13, 14].map(hour => timed(`e${hour}`, `Event at ${hour}`, at(2, hour))) });
        await screen.findByText('+3');
        expect(texts(day('2026-11-02'), '.upcoming-title')).toEqual(['Event at 9', 'Event at 10', 'Event at 11']);
    });


    it('says when the events could not load', async () => {
        const api = fakeServer({});
        api.install();
        render(<UpcomingWidget />);
        expect(await screen.findByText("Couldn't load upcoming events.")).toBeTruthy();
    });
});
