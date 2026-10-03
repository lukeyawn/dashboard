// GET /api/today: everything about today in one answer, mainly for the agent
// (DESIGN §4). Built from the same stores the widgets read.
import { boardApplications, isActive } from '../shared/applications.js';
import { addDays, daysBetween, today as todayOf } from '../shared/dates.js';
import { STATUSES } from '../shared/schemas.js';
import { splitTasks } from '../shared/tasks.js';
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
    const { assignments, tasks } = splitTasks(stores.tasks.list({ done: false }), settings.get('assignments_area'));
    return {
        date,
        now: now.toISOString(),
        events,
        birthdays_this_week: birthdays,
        // as the two tiles show them (docs/BLOCKS.md §3): the assignments area's
        // tasks with a due date, nearest first, then every other open task
        assignments: assignments.map(t => ({ ...t, days_left: daysBetween(date, t.due) })),
        tasks,
        // dreams stay off the tile, and out of the day
        goals: stores.goals.list({ archived: false, dream: false }),
        habits: stores.habits.list({ days: 7, archived: false }).map(h => ({
            id: h.id, name: h.name, per_week: h.per_week, done_today: h.checks.includes(date), week_count: h.week_count, streak: h.streak, checks: h.checks,
        })),
        // the nearest current ones, by the store's rule: by date, then time (docs/BLOCKS.md §4)
        countdowns: stores.countdowns.list()
            .slice(0, 3)
            .map(c => ({ ...c, days_left: daysBetween(date, c.target_date) })),
        applications: {
            counts: Object.fromEntries(STATUSES.map(s => [s, applications.filter(a => a.status === s).length])),
            // the OAs, interviews and offers, by their next step, as the tile lists them (docs/BLOCKS.md §6)
            active: boardApplications(applications).filter(isActive),
        },
        weather,
        night: nightState(now, {
            night_start: settings.get('night_start'),
            night_end: settings.get('night_end'),
            night_early_until: settings.get('night_early_until'),
        }),
    };
}
