// Calendar dates are 'YYYY-MM-DD' strings that mean a local date (DESIGN §3).
// Never pass one to new Date(string): that parses as UTC midnight, which is
// the previous day in US time zones. Use these helpers everywhere instead.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isDateString(text) {
    if (typeof text !== 'string' || !DATE_PATTERN.test(text)) return false;
    const [y, m, d] = text.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// local midnight of the given date
export function parseDate(text) {
    if (!isDateString(text)) throw new Error(`Not a valid YYYY-MM-DD date: ${text}`);
    const [y, m, d] = text.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function today(now = new Date()) {
    return formatDate(now);
}

export function addDays(text, days) {
    const date = parseDate(text);
    date.setDate(date.getDate() + days);
    return formatDate(date);
}

// whole days from one date to another; a day with a clock change is 23 or 25
// hours long, so the difference of local midnights is rounded
export function daysBetween(from, to) {
    return Math.round((parseDate(to) - parseDate(from)) / DAY_MS);
}

export const WEEK_STARTS = ['sunday', 'monday'];

// the first day of the calendar week holding a date, for weeks that start on
// weekStart ('sunday' or 'monday', the week_start setting)
export function startOfWeek(text, weekStart = 'sunday') {
    const first = weekStart === 'monday' ? 1 : 0;
    return addDays(text, -((parseDate(text).getDay() - first + 7) % 7));
}
