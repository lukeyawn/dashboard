import { daysBetween, parseDate } from '../../../shared/dates';

// "overdue", "today", "tomorrow" or "N days" (DESIGN §10, Assignments)
export function daysLabel(days) {
    if (days < 0) return 'overdue';
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    return `${days} days`;
}

// overdue, or due within 2 days: shown in --urgent (docs/BLOCKS.md §3)
export const isUrgent = days => days <= 2;

// A due date as a Tasks row reads it (docs/BLOCKS.md §3): "overdue", "today",
// "tomorrow", a weekday within 6 days ("Thu"), otherwise the date ("Oct 14")
export function dueLabel(todayDate, due) {
    const days = daysBetween(todayDate, due);
    if (days <= 1) return daysLabel(days);
    const date = parseDate(due);
    return days <= 6
        ? date.toLocaleDateString('en-US', {weekday: 'short'})
        : date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}
