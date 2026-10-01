import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCalendarFeed, occurrences, parseFeed } from './calendar.js';

// tests run in America/Chicago, like the fixture's events
const ICS = fs.readFileSync(new URL('./fixtures/calendar.ics', import.meta.url), 'utf8');
const feed = parseFeed(ICS);
const local = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

describe('occurrences', () => {
    it('lists a day of events with the calendar name and location', () => {
        const { events } = occurrences(feed, '2026-09-30', '2026-09-30');
        expect(events.map(e => [e.title, local(e.start)])).toEqual([
            ['Algorithms lecture (moved)', '11:00 AM'],
            ['Office hours', '2:00 PM'],
        ]);
        expect(events[0]).toMatchObject({ all_day: false, location: 'GDC 1.304', calendar: 'Luke' });
        expect(events[0].id).toBe('lecture@example.com/2026-09-30T16:00:00.000Z');
    });

    it('applies a changed occurrence instead of the original', () => {
        const titles = occurrences(feed, '2026-09-30', '2026-09-30').events.map(e => e.title);
        expect(titles).not.toContain('Algorithms lecture');
    });

    it('skips dates removed from a repeating event', () => {
        expect(occurrences(feed, '2026-09-07', '2026-09-07').events).toEqual([]);
        expect(occurrences(feed, '2026-09-09', '2026-09-09').events.map(e => e.title)).toEqual(['Algorithms lecture']);
    });

    it('keeps local times across a clock change', () => {
        const before = occurrences(feed, '2026-10-26', '2026-10-26').events[0];
        const after = occurrences(feed, '2026-11-02', '2026-11-02').events[0];
        expect(local(before.start)).toBe('9:00 AM');
        expect(local(after.start)).toBe('9:00 AM');
    });

    it('leaves out cancelled events', () => {
        const titles = occurrences(feed, '2026-09-30', '2026-09-30').events.map(e => e.title);
        expect(titles).not.toContain('Cancelled meeting');
    });

    it('gives all-day events local dates, with an inclusive end, first in the list', () => {
        const { events } = occurrences(feed, '2026-11-26', '2026-11-26');
        expect(events).toEqual([expect.objectContaining({ title: 'Thanksgiving break', start: '2026-11-25', end: '2026-11-28', all_day: true })]);
        expect(occurrences(feed, '2026-11-29', '2026-11-29').events).toEqual([]);
        expect(occurrences(feed, '2026-10-02', '2026-10-02').events[0]).toMatchObject({ start: '2026-10-02', end: '2026-10-02' });
    });

    it('treats yearly all-day events as birthdays, every year, and not as events', () => {
        const thisYear = occurrences(feed, '2026-09-01', '2026-10-31');
        expect(thisYear.birthdays).toEqual([{ id: 'mom@example.com/2026-09-30', title: "Mom's birthday", date: '2026-09-30' }]);
        expect(thisYear.events.map(e => e.title)).not.toContain("Mom's birthday");
        expect(occurrences(feed, '2030-09-30', '2030-09-30').birthdays[0].date).toBe('2030-09-30');
    });
});

describe('createCalendarFeed', () => {
    const dirs = [];
    const cacheIn = () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-'));
        dirs.push(dir);
        return path.join(dir, 'cache', 'calendar.ics');
    };
    const quiet = { error: vi.fn() };
    afterEach(() => {
        while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
        quiet.error.mockClear();
    });

    it('is empty without a URL', async () => {
        const calendar = createCalendarFeed({});
        await calendar.refresh();
        expect(calendar.between('2026-09-30', '2026-09-30')).toEqual({ events: [], birthdays: [] });
        expect(calendar.status().configured).toBe(false);
    });

    it('fetches the feed and keeps a copy on disk', async () => {
        const cacheFile = cacheIn();
        const fetch = vi.fn(async () => new Response(ICS));
        const calendar = createCalendarFeed({ url: 'https://calendar.example/private-abc/basic.ics', cacheFile, fetch, now: () => 0 });
        await calendar.refresh();
        expect(calendar.between('2026-09-30', '2026-09-30').events).toHaveLength(2);
        expect(fs.readFileSync(cacheFile, 'utf8')).toBe(ICS);
        expect(calendar.status()).toMatchObject({ last_success: new Date(0).toISOString(), last_error: null });
    });

    it('serves the saved copy after a restart while offline, and never logs the URL', async () => {
        const cacheFile = cacheIn();
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, ICS);
        const url = 'https://calendar.example/private-secret/basic.ics';
        const calendar = createCalendarFeed({ url, cacheFile, fetch: async () => { throw new Error('offline'); }, log: quiet });
        await calendar.refresh();
        expect(calendar.between('2026-09-30', '2026-09-30').events).toHaveLength(2);
        expect(calendar.status().last_error).toBe('offline');
        expect(quiet.error.mock.calls.flat().join(' ')).not.toContain('private-secret');
    });

    it('keeps the last good copy when Google answers with an error', async () => {
        const responses = [new Response(ICS), new Response('nope', { status: 500 })];
        const calendar = createCalendarFeed({ url: 'https://x', fetch: async () => responses.shift(), log: quiet });
        await calendar.refresh();
        await calendar.refresh();
        expect(calendar.between('2026-09-30', '2026-09-30').events).toHaveLength(2);
        expect(calendar.status().last_error).toBe('Google answered 500');
    });

    it('ignores an unreadable cache', () => {
        const cacheFile = cacheIn();
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:garbage');
        const calendar = createCalendarFeed({ cacheFile, log: quiet });
        expect(calendar.between('2026-09-30', '2026-09-30').events).toEqual([]);
    });

    it('refreshes on a timer once started', async () => {
        vi.useFakeTimers();
        const fetch = vi.fn(async () => new Response(ICS));
        const calendar = createCalendarFeed({ url: 'https://x', fetch });
        calendar.start();
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
        calendar.stop();
        await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
        expect(fetch).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });
});
