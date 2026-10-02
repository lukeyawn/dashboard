// How tasks are split and ordered (docs/BLOCKS.md §3), shared by the tiles
// and /api/today.

// The Assignments tile's tasks: a due date, in the assignments_area setting's
// area. Every other open task is in Tasks, so none is on two tiles.
export function isAssignment(task, assignmentsArea) {
    return Boolean(task.due) && assignmentsArea != null && task.area_id === assignmentsArea;
}

// open tasks → { assignments, tasks }, each in its tile's default order
export function splitTasks(open, assignmentsArea) {
    return {
        assignments: open.filter(t => isAssignment(t, assignmentsArea)).sort(compareDue),
        tasks: open.filter(t => !isAssignment(t, assignmentsArea)).sort(compareTasks),
    };
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

// the Assignments tile's order: soonest first, then by priority
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
