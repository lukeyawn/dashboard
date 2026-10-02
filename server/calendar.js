// Reads Google Calendar's private iCal feeds (DESIGN §4, Google Calendar).
// Events are expanded into occurrences here, so the dashboard and the agent
// always agree, and yearly all-day events are treated as birthdays.
import fs from 'node:fs';
import path from 'node:path';
import ical from 'node-ical';
import { addDays, formatDate, parseDate } from '../shared/dates.js';

const REFRESH_MS = 10 * 60 * 1000;

export function parseFeed(icsText) {
    const parsed = ical.sync.parseICS(icsText);
    const calendar = parsed.vcalendar?.['WR-CALNAME'] ?? null;
    const events = Object.values(parsed).filter(e => e.type === 'VEVENT' && e.status !== 'CANCELLED');
    return { calendar, events };
}

function isYearly(event) {
    return Boolean(event.rrule) && /FREQ=YEARLY/.test(event.rrule.toString());
}

function textOf(value) {
    if (value === undefined || value === null) return null;
    return typeof value === 'object' ? String(value.val ?? '') : String(value);
}

// Every occurrence that overlaps the local dates from..to (both included).
// Returns { events, birthdays }: birthdays are the yearly all-day ones.
export function occurrences({ calendar, events }, from, to) {
    const start = parseDate(from);
    const end = new Date(parseDate(addDays(to, 1)).getTime() - 1);
    const found = { events: [], birthdays: [] };

    for (const event of events) {
        // a changed occurrence is applied through its base event, not on its own
        if (event.recurrenceid && events.some(e => e !== event && e.uid === event.uid && !e.recurrenceid)) continue;

        const instances = ical.expandRecurringEvent(event, { from: start, to: end, expandOngoing: true });
        for (const instance of instances) {
            const source = instance.event ?? event;
            if (source.status === 'CANCELLED') continue;
            const title = textOf(instance.summary ?? source.summary) ?? '(no title)';

            if (instance.isFullDay) {
                // all-day dates have no time or time zone; they're local dates (DESIGN §14)
                const first = formatDate(instance.start);
                // iCal's end date is exclusive
                const last = addDays(formatDate(instance.end), -1) < first ? first : addDays(formatDate(instance.end), -1);
                if (last < from || first > to) continue;
                if (isYearly(event)) {
                    found.birthdays.push({ id: `${event.uid}/${first}`, title, date: first });
                } else {
                    found.events.push({ id: `${event.uid}/${first}`, title, start: first, end: last, all_day: true, location: textOf(source.location), calendar });
                }
                continue;
            }

            if (instance.end <= start || instance.start > end) continue;
            found.events.push({
                id: `${event.uid}/${instance.start.toISOString()}`,
                title,
                start: instance.start.toISOString(),
                end: instance.end.toISOString(),
                all_day: false,
                location: textOf(source.location),
                calendar,
            });
        }
    }

    return sorted(found);
}

// all-day events first, then by start; birthdays by date
function sorted({ events, birthdays }) {
    const byStart = (a, b) => (a.start ?? a.date).localeCompare(b.start ?? b.date) || a.title.localeCompare(b.title);
    events.sort((a, b) => Number(b.all_day) - Number(a.all_day) || byStart(a, b));
    birthdays.sort(byStart);
    return { events, birthdays };
}

// The main calendar and the optional routine one (classes), read as one
// (docs/BLOCKS.md §1). Every event is tagged with which it came from: routine
// events are on Today and in Claude's answers, but not on Upcoming. Birthdays
// come from the main calendar only.
export function combineFeeds(main, routine = null) {
    const feeds = [main, routine].filter(Boolean);
    return {
        refresh: () => Promise.all(feeds.map(f => f.refresh())),
        start: () => feeds.forEach(f => f.start()),
        stop: () => feeds.forEach(f => f.stop()),
        // the routine feed's health travels with the main one's, for the dock
        status: () => ({ ...main.status(), routine: routine?.status() ?? null }),
        between(from, to) {
            const { events, birthdays } = main.between(from, to);
            const classes = routine?.between(from, to).events ?? [];
            return sorted({
                events: [...events.map(e => ({ ...e, routine: false })), ...classes.map(e => ({ ...e, routine: true }))],
                birthdays,
            });
        },
    };
}

// Fetches the feed every 10 minutes and keeps the last good copy on disk, so
// a failed fetch or an offline restart still serves events.
// name says which feed failed, in the log
export function createCalendarFeed({ url, cacheFile, name = 'Calendar', fetch = globalThis.fetch, now = Date.now, log = console } = {}) {
    let feed = { calendar: null, events: [] };
    // failing_since: when fetches started failing, so a brief outage isn't a problem
    let status = { configured: Boolean(url), last_success: null, last_error: null, failing_since: null };
    let timer = null;

    if (cacheFile && fs.existsSync(cacheFile)) {
        try {
            feed = parseFeed(fs.readFileSync(cacheFile, 'utf8'));
        } catch (err) {
            log.error(`Ignoring an unreadable ${name.toLowerCase()} cache: ${err.message}`);
        }
    }

    async function refresh() {
        if (!url) return;
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
            if (!res.ok) throw new Error(`Google answered ${res.status}`);
            const text = await res.text();
            feed = parseFeed(text);
            status = { ...status, last_success: new Date(now()).toISOString(), last_error: null, failing_since: null };
            if (cacheFile) {
                fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
                fs.writeFileSync(`${cacheFile}.tmp`, text);
                fs.renameSync(`${cacheFile}.tmp`, cacheFile);
            }
        } catch (err) {
            // never log the URL itself: it's a password (DESIGN §2)
            status = { ...status, last_error: err.message, failing_since: status.failing_since ?? new Date(now()).toISOString() };
            log.error(`${name} refresh failed: ${err.message}`);
        }
    }

    return {
        refresh,
        start() {
            refresh();
            timer = setInterval(refresh, REFRESH_MS);
            timer.unref?.();
        },
        stop() {
            clearInterval(timer);
        },
        status: () => status,
        between: (from, to) => occurrences(feed, from, to),
    };
}
