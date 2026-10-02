import { daysBetween, today } from '../../../shared/dates';
import { compareCountdowns, countdownMoment, isCurrent } from '../../../shared/countdowns';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Which countdown to show (DESIGN §10, Countdown): a birthday within the next
// 7 days, otherwise the pinned countdown, otherwise the nearest one, by the
// server's order. The server lists only current countdowns, but the list is
// polled, so one that passed at midnight is left out here too (docs/BLOCKS.md §4).
export function chooseCountdown({ todayDate, countdowns = [], birthdays = [] }) {
    const soonBirthday = birthdays.find(b => b.date >= todayDate && daysBetween(todayDate, b.date) <= 7);
    if (soonBirthday) return { label: soonBirthday.title, date: soonBirthday.date, time: null, detail: 'days' };
    const current = countdowns.filter(c => isCurrent(c, todayDate)).sort(compareCountdowns);
    const chosen = current.find(c => c.pinned) ?? current[0];
    if (!chosen) return null;
    return {
        label: chosen.label,
        date: chosen.target_date,
        time: chosen.target_time ?? null,
        detail: chosen.detail ?? 'days',
        ...(chosen.claude_change ? { claude_change: chosen.claude_change } : {}),
    };
}

// Days when 60 or fewer remain, otherwise weeks; "Today" on the day itself
export function countdownNumber(days) {
    if (days === 0) return { number: 'Today', unit: null };
    if (days <= 60) return { number: String(days), unit: days === 1 ? 'day' : 'days' };
    const weeks = Math.round(days / 7);
    return { number: String(weeks), unit: 'weeks' };
}

const plural = (n, unit) => ({ number: String(n), unit: n === 1 ? unit : `${unit}s` });

// What the tile shows for a chosen countdown at `now` (docs/BLOCKS.md §4):
// { number, unit } as countdownNumber, plus kind 'clock' for the live H:MM:SS
// and 'seconds' for the last minute, which fills the tile alone.
//   days:  weeks, days, then "Today" all through the target day
//   hours: as days, then hours under 48 hours and minutes under 1 hour
//   live:  as hours, then a ticking H:MM:SS in the last 24 hours
// Once a timed countdown's moment has come, it reads "Today" for the rest of its day.
export function countdownDisplay({ date, time, detail }, now) {
    const shown = countdownNumber(daysBetween(today(now), date));
    if (detail === 'days' || !time) return shown;
    const left = countdownMoment({ target_date: date, target_time: time }) - now;
    if (left <= 0) return { number: 'Today', unit: null };
    if (detail === 'live' && left <= 24 * HOUR) {
        const seconds = Math.ceil(left / 1000);
        if (seconds < 60) return { number: String(seconds), unit: null, kind: 'seconds' };
        // H:MM:SS, and M:SS in the last hour, so the clock grows as it gets close
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor(seconds / 60) % 60;
        const ss = String(seconds % 60).padStart(2, '0');
        const clock = hours ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
        return { number: clock, unit: null, kind: 'clock' };
    }
    if (left <= 59 * MINUTE) return plural(Math.ceil(left / MINUTE), 'minute');
    if (left < 48 * HOUR) return plural(Math.max(1, Math.floor(left / HOUR)), 'hour');
    return shown;
}

// The live clock's parts: with hours left, H:MM large and the seconds small
// beside it, as on the dock; in the last hour, M:SS all large
export function clockParts(clock) {
    const [hours, minutes, seconds] = clock.split(':');
    return seconds === undefined ? { main: clock, seconds: null } : { main: `${hours}:${minutes}`, seconds };
}

// SMALL is the seconds' size beside H:MM, as a share of the clock's
const SMALL = 0.4;
const ems = text => [...text].reduce((sum, c) => sum + (c === ':' ? 0.29 : 0.64), 0);

// How wide the clock is, in ems of Inter's tabular digits (0.64em) and colons
// (0.29em), so the tile can size it to fill its width
export function clockEms(clock) {
    const { main, seconds } = clockParts(clock);
    return ems(main) + (seconds ? 0.08 + SMALL * ems(seconds) : 0);
}

// The tile ticks every second only during a live countdown's last day
export function needsSeconds({ date, time, detail }, now) {
    if (detail !== 'live' || !time) return false;
    const left = countdownMoment({ target_date: date, target_time: time }) - now;
    return left > 0 && left <= 24 * HOUR + MINUTE;
}
