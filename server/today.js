// GET /api/today: everything about today in one answer, mainly for the agent
// (DESIGN §4). Built from the same stores the widgets read.
import { addDays, daysBetween, today as todayOf } from '../shared/dates.js';
import { STATUSES } from '../shared/schemas.js';
import { compareDue, compareTasks, isDueSoon } from '../shared/tasks.js';
import { nightState } from './night.js';
import { chooseLocation } from './weather.js';

export async function todaySnapshot({ stores, settings, calendar, weatherAt, now }) {
    const date = todayOf(now);
    const { events } = calendar.between(date, date);
    const { birthdays } = calendar.between(date, addDays(date, 7));

    let weather = null;
    if (weatherAt) {
        const location = chooseLocation(null, settings.get('kiosk_location'));
        weather = await weatherAt(location).then(w => ({ location, ...w }), () => null);
    }

    const applications = stores.applications.list();
    const openTasks = stores.tasks.list({ done: false });
    return {
        date,
        now: now.toISOString(),
        events,
        birthdays_this_week: birthdays,
        // as the two tiles show them: overdue or due within 14 days, then the rest
        due_soon: openTasks.filter(t => isDueSoon(t, date)).sort(compareDue)
            .map(t => ({ ...t, days_left: daysBetween(date, t.due) })),
        tasks: openTasks.filter(t => !isDueSoon(t, date)).sort(compareTasks),
        goals: stores.goals.list({ archived: false }),
        habits: stores.habits.list({ days: 7, archived: false }).map(h => ({
            id: h.id, name: h.name, per_week: h.per_week, done_today: h.checks.includes(date), week_count: h.week_count, streak: h.streak, checks: h.checks,
        })),
        // the nearest current ones, by the store's rule: by date, then time (docs/BLOCKS.md §4)
        countdowns: stores.countdowns.list()
            .slice(0, 3)
            .map(c => ({ ...c, days_left: daysBetween(date, c.target_date) })),
        applications: {
            counts: Object.fromEntries(STATUSES.map(s => [s, applications.filter(a => a.status === s).length])),
            recent: applications.slice(0, 5),
        },
        weather,
        night: nightState(now, {
            night_start: settings.get('night_start'),
            night_end: settings.get('night_end'),
            night_early_until: settings.get('night_early_until'),
        }),
    };
}
