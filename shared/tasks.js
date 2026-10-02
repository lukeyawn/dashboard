// How tasks are split and ordered (DESIGN §10), shared by the tiles and /api/today.
import { daysBetween } from './dates.js';

export const DUE_SOON_DAYS = 14;

// overdue, or due within the next two weeks: the Due soon tile's tasks
export function isDueSoon(task, todayDate) {
    return Boolean(task.due) && daysBetween(todayDate, task.due) <= DUE_SOON_DAYS;
}

const PRIORITY_ORDER = { now: 0, soon: 1, someday: 2 };
const byPriority = (a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);

// the Tasks tile's order (docs/BLOCKS.md §3): now → soon → someday, then due
// date (none last), then shortest first (no estimate last), then oldest first
export function compareTasks(a, b) {
    return byPriority(a, b)
        || (a.due ?? '9999').localeCompare(b.due ?? '9999')
        || (a.minutes ?? Infinity) - (b.minutes ?? Infinity)
        || a.id - b.id;
}

// the Due soon tile's order: soonest first, then by priority
export function compareDue(a, b) {
    return a.due.localeCompare(b.due) || byPriority(a, b) || a.id - b.id;
}

// A time estimate as a chip reads it: "15m" under an hour, "1h" at an hour,
// and "1h+" above, where the precision isn't real (docs/BLOCKS.md §3)
export function minutesLabel(minutes) {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes}m`;
    return minutes === 60 ? '1h' : '1h+';
}
