// "overdue", "today", "tomorrow" or "N days" (DESIGN §10, Deadlines)
export function daysLabel(days) {
    if (days < 0) return 'overdue';
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    return `${days} days`;
}
