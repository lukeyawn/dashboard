// Countdown rules shared by the server, the tile and the editor
// (docs/BLOCKS.md §4), so all three agree on what has passed and why.
import { isDateString, parseDate, today } from './dates.js';

// how much the tile shows: days (and weeks), then hours and minutes, then a live clock
export const DETAILS = ['days', 'hours', 'live'];

// The moment a countdown counts to: its time on its date, or the start of
// its day when it has no time
export function countdownMoment({ target_date: date, target_time: time }) {
    const moment = parseDate(date);
    if (time) {
        const [hours, minutes] = time.split(':').map(Number);
        moment.setHours(hours, minutes);
    }
    return moment;
}

// A countdown is current through its whole target day, and past from the
// next. Worked out every time, so it can't go stale.
export const isCurrent = (countdown, todayDate) => countdown.target_date >= todayDate;

// nearest first: by date, then a countdown without a time (it counts to the
// start of the day), then by time, then oldest first
export function compareCountdowns(a, b) {
    return a.target_date.localeCompare(b.target_date)
        || (a.target_time ?? '').localeCompare(b.target_time ?? '')
        || a.id - b.id;
}

// "14:05" → "2:05 PM"
export function formatClock(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

const longDate = date => parseDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Why a new date (and time) for a countdown is refused, or null if it's fine.
// Today is allowed; a timed countdown is allowed until its time. A past date
// gets a hint when the same date next year is still ahead.
export function pastDateProblem({ target_date: date, target_time: time = null }, now) {
    const todayDate = today(now);
    if (date === todayDate && time && countdownMoment({ target_date: date, target_time: time }) <= now) {
        return `That time has passed (${formatClock(time)} today).`;
    }
    if (date >= todayDate) return null;
    const nextYear = `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`;
    const hint = isDateString(nextYear) && countdownMoment({ target_date: nextYear, target_time: time }) > now
        ? ` Did you mean ${nextYear.slice(0, 4)}?`
        : '';
    return `That date has passed (${longDate(date)}).${hint}`;
}

// hours and live count down to a moment, so they need a time
export function detailProblem({ detail = 'days', target_time: time = null }) {
    return detail !== 'days' && !time ? 'Hours and live need a time.' : null;
}

// The problems with a countdown's values, as { field: message }, or null.
// before: the stored countdown when editing one. Moving a date or time is
// checked; renaming a past countdown, or changing anything else, isn't.
export function countdownProblems(values, now, before = null) {
    const merged = { ...before, ...values };
    const problems = {};
    const moved = !before || 'target_date' in values || 'target_time' in values;
    const past = moved && merged.target_date && pastDateProblem(merged, now);
    // a time passed today belongs beside the time field, a past date beside the date
    if (past) problems[merged.target_date === today(now) ? 'target_time' : 'target_date'] = past;
    const detail = detailProblem(merged);
    if (detail) problems.detail = detail;
    return Object.keys(problems).length ? problems : null;
}
