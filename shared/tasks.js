// How tasks are split and ordered (DESIGN §10), shared by the tiles and /api/today.
import { daysBetween } from './dates.js';

export const DUE_SOON_DAYS = 14;

// overdue, or due within the next two weeks: the Due soon tile's tasks
export function isDueSoon(task, todayDate) {
    return Boolean(task.due) && daysBetween(todayDate, task.due) <= DUE_SOON_DAYS;
}

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };
const EFFORT_ORDER = { quick: 0, medium: 1, big: 2 };

// the Tasks tile's order: priority, then due date (none last), then effort
// (unknown last), then oldest first
export function compareTasks(a, b) {
    return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
        || (a.due ?? '9999').localeCompare(b.due ?? '9999')
        || (EFFORT_ORDER[a.effort] ?? 3) - (EFFORT_ORDER[b.effort] ?? 3)
        || a.id - b.id;
}

// the Due soon tile's order: soonest first, then by priority
export function compareDue(a, b) {
    return a.due.localeCompare(b.due) || (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1) || a.id - b.id;
}
