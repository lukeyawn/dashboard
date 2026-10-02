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
        const clock = `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        return { number: clock, unit: null, kind: 'clock' };
    }
    if (left <= 59 * MINUTE) return plural(Math.ceil(left / MINUTE), 'minute');
    if (left < 48 * HOUR) return plural(Math.max(1, Math.floor(left / HOUR)), 'hour');
    return shown;
}

// The tile ticks every second only during a live countdown's last day
export function needsSeconds({ date, time, detail }, now) {
    if (detail !== 'live' || !time) return false;
    const left = countdownMoment({ target_date: date, target_time: time }) - now;
    return left > 0 && left <= 24 * HOUR + MINUTE;
}
