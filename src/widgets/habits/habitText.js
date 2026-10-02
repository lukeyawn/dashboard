// How a habit's progress reads, on the tile and in its editor (docs/BLOCKS.md §2)

// "4-day streak" for a daily habit, "3-week streak" below 7 a week; null at 0
export function streakText(habit) {
    if (!habit.streak) return null;
    return `${habit.streak}-${habit.per_week < 7 ? 'week' : 'day'} streak`;
}

// "2/3 this week", for a habit below 7 a week; null for a daily one
export function weekText(habit) {
    return habit.per_week < 7 ? `${habit.week_count}/${habit.per_week} this week` : null;
}
