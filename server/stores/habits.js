import { addDays, today as todayOf } from '../../shared/dates.js';
import { createStore } from '../crud.js';

// Consecutive done days ending today, or ending yesterday if today isn't
// done yet, so the streak doesn't read 0 every morning (DESIGN §10, Habits).
// dates: the habit's checked dates, newest first.
export function streak(dates, today) {
    const done = new Set(dates);
    let day = done.has(today) ? today : addDays(today, -1);
    let count = 0;
    while (done.has(day)) {
        count++;
        day = addDays(day, -1);
    }
    return count;
}

export function createHabitStore(db, { now = () => new Date() } = {}) {
    const store = createStore(db, {
        table: 'habits',
        columns: ['name', 'position', 'archived_at'],
        orderBy: 'position, id',
        filters: { archived: { true: 'archived_at IS NOT NULL', false: 'archived_at IS NULL' } },
    });
    const checksOf = db.prepare('SELECT date FROM habit_checks WHERE habit_id = ? ORDER BY date DESC');
    const check = db.prepare('INSERT OR IGNORE INTO habit_checks (habit_id, date) VALUES (?, ?)');
    const uncheck = db.prepare('DELETE FROM habit_checks WHERE habit_id = ? AND date = ?');

    // the habit, with its checked dates in the last `days` days (oldest first) and its streak
    function withChecks(habit, days) {
        if (!habit) return null;
        const today = todayOf(now());
        const since = addDays(today, 1 - days);
        const dates = checksOf.all(habit.id).map(row => row.date);
        return {
            ...habit,
            checks: dates.filter(d => d >= since && d <= today).reverse(),
            streak: streak(dates, today),
        };
    }

    return {
        ...store,
        today: () => todayOf(now()),
        list({ days = 7, ...filters } = {}) {
            return store.list(filters).map(habit => withChecks(habit, days));
        },
        withChecks: (id, days = 7) => withChecks(store.get(id), days),
        // both idempotent; null if there's no such habit
        setCheck(id, date, done, days = 7) {
            if (!store.get(id)) return null;
            (done ? check : uncheck).run(id, date);
            return withChecks(store.get(id), days);
        },
    };
}
