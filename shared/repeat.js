// Recurring tasks (docs/BLOCKS.md §3): a structured rule, not iCal RRULE.
//   { every, unit: 'day' | 'week' | 'month' | 'year', weekdays?, day_of_month? }
// weekdays (0 = Sunday … 6 = Saturday) only for weeks; day_of_month only for
// months. A recurring task has a due date, and completing it moves the due
// date to the next occurrence instead of marking it done.
import { addDays, daysBetween, formatDate, parseDate, startOfWeek } from './dates.js';

export const UNITS = ['day', 'week', 'month', 'year'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

// the day-th of a month, or its last day when the month is shorter (the 31st → Feb 28)
function dayOfMonth(year, month, day) {
    return formatDate(new Date(year, month, Math.min(day, daysInMonth(year, month))));
}

// The first occurrence after both the current due date and today, so a late
// completion skips the missed dates and nothing piles up, and an early one
// still moves to the next date.
export function nextOccurrence(rule, due, todayDate) {
    const after = due > todayDate ? due : todayDate;
    const { every, unit } = rule;

    if (unit === 'day') {
        return addDays(due, (Math.floor(daysBetween(due, after) / every) + 1) * every);
    }

    if (unit === 'week') {
        // weeks are counted from the one holding the due date, Sunday first
        const weekdays = rule.weekdays?.length ? rule.weekdays : [parseDate(due).getDay()];
        const anchor = startOfWeek(due, 'sunday');
        for (let day = addDays(after, 1); ; day = addDays(day, 1)) {
            const inPeriod = Math.floor(daysBetween(anchor, day) / 7) % every === 0;
            if (inPeriod && weekdays.includes(parseDate(day).getDay())) return day;
        }
    }

    const start = parseDate(due);
    if (unit === 'month') {
        const day = rule.day_of_month ?? start.getDate();
        for (let k = 0; ; k += every) {
            const month = start.getMonth() + k;
            const date = dayOfMonth(start.getFullYear() + Math.floor(month / 12), month % 12, day);
            if (date > after) return date;
        }
    }

    // a year: the same month and day, Feb 29 becoming Feb 28 in other years
    for (let k = every; ; k += every) {
        const date = dayOfMonth(start.getFullYear() + k, start.getMonth(), start.getDate());
        if (date > after) return date;
    }
}

const ordinal = n => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

// "every day", "every 2 weeks on Mon, Thu", "every month on the 1st"
export function describeRepeat(rule) {
    if (!rule) return null;
    const every = rule.every === 1 ? `every ${rule.unit}` : `every ${rule.every} ${rule.unit}s`;
    if (rule.unit === 'week' && rule.weekdays?.length) return `${every} on ${[...rule.weekdays].sort().map(d => WEEKDAYS[d]).join(', ')}`;
    if (rule.unit === 'month' && rule.day_of_month) return `${every} on the ${ordinal(rule.day_of_month)}`;
    return every;
}
