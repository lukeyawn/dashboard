import { addDays, startOfWeek, today as todayOf } from '../../shared/dates.js';
import { createStore } from '../crud.js';

// how many of the dates fall in the week starting on `from`
const countInWeek = (dates, from) => {
    const to = addDays(from, 6);
    return dates.filter(d => d >= from && d <= to).length;
};

// A daily habit (7 a week): consecutive done days ending today, or ending
// yesterday if today isn't done yet, so the streak doesn't read 0 every
// morning (DESIGN §10, Habits).
// Below 7 a week: calendar weeks in a row that met the target, ending with
// this week if it's already met and with last week otherwise, so the streak
// doesn't drop to 0 at the start of every week (docs/BLOCKS.md §2).
// dates: the habit's checked dates. Worked out on every read, so changing
// week_start or per_week loses nothing.
export function streak(dates, today, perWeek = 7, weekStart = 'sunday') {
    let count = 0;
    if (perWeek >= 7) {
        const done = new Set(dates);
        let day = done.has(today) ? today : addDays(today, -1);
        while (done.has(day)) {
            count++;
            day = addDays(day, -1);
        }
        return count;
    }
    const thisWeek = startOfWeek(today, weekStart);
    let week = countInWeek(dates, thisWeek) >= perWeek ? thisWeek : addDays(thisWeek, -7);
    // ends at the first week short of the target, at the latest the week before the first check
    while (countInWeek(dates, week) >= perWeek) {
        count++;
        week = addDays(week, -7);
    }
    return count;
}

// weekStart: returns the week_start setting, 'sunday' or 'monday'
export function createHabitStore(db, { now = () => new Date(), log, weekStart = () => 'sunday' } = {}) {
    const store = createStore(db, {
        table: 'habits',
        columns: ['name', 'position', 'per_week', 'archived_at'],
        orderBy: 'position, id',
        filters: { archived: { true: 'archived_at IS NOT NULL', false: 'archived_at IS NULL' } },
        log,
    });
    const checksOf = db.prepare('SELECT date FROM habit_checks WHERE habit_id = ? ORDER BY date DESC');
    const check = db.prepare('INSERT OR IGNORE INTO habit_checks (habit_id, date) VALUES (?, ?)');
    const uncheck = db.prepare('DELETE FROM habit_checks WHERE habit_id = ? AND date = ?');

    // the habit, with its checked dates in the last `days` days (oldest first),
    // how many days it's been done this calendar week, and its streak
    function withChecks(habit, days) {
        if (!habit) return null;
        const today = todayOf(now());
        const since = addDays(today, 1 - days);
        const dates = checksOf.all(habit.id).map(row => row.date);
        const start = weekStart();
        return {
            ...habit,
            checks: dates.filter(d => d >= since && d <= today).reverse(),
            week_count: countInWeek(dates, startOfWeek(today, start)),
            streak: streak(dates, today, habit.per_week, start),
        };
    }

    return {
        ...store,
        today: () => todayOf(now()),
        list({ days = 7, ...filters } = {}) {
            return store.list(filters).map(habit => withChecks(habit, days));
        },
        withChecks: (id, days = 7) => withChecks(store.get(id), days),
        // both idempotent; null if there's no such habit. Only a real change is recorded.
        setCheck: db.transaction((id, date, done, days = 7) => {
            const habit = store.get(id);
            if (!habit) return null;
            const changed = (done ? check : uncheck).run(id, date).changes === 1;
            if (changed) {
                // the name only helps the History read well; undo uses habit_id and date
                const row = { habit_id: id, date, name: habit.name };
                log?.record({ resource: 'habit_checks', itemId: `${id}:${date}`, action: done ? 'create' : 'delete', before: done ? null : row, after: done ? row : null });
            }
            return withChecks(store.get(id), days);
        }),

        // Deleting a habit deletes its checks, so the record keeps them with
        // the habit, and undoing the delete brings them back
        remove: db.transaction(id => {
            const before = store.raw(id);
            if (!before) return false;
            const dates = checksOf.all(id).map(row => row.date);
            db.prepare('DELETE FROM habits WHERE id = ?').run(id);
            log?.record({ resource: 'habits', itemId: id, action: 'delete', before: { ...before, _checks: dates }, after: null });
            return true;
        }),
    };
}
