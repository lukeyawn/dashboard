// Development data: `npm run seed`. Only fills empty tables, so it never touches real data.
import { addDays, today } from '../shared/dates.js';
import { openDatabase } from './db.js';
import { createApplicationStore } from './stores/applications.js';
import { createCountdownStore } from './stores/countdowns.js';
import { createGoalStore } from './stores/goals.js';
import { createHabitStore } from './stores/habits.js';
import { createTaskStore } from './stores/tasks.js';

const db = openDatabase(process.env.DATABASE ?? 'data/dashboard.db');
const day = offset => addDays(today(), offset);

function seed(name, store, rows, after = () => {}) {
    if (store.list().length > 0) {
        console.log(`${name}: already has data, left alone.`);
        return;
    }
    rows.forEach(row => after(store.create(row), row));
    console.log(`${name}: added ${rows.length}.`);
}

// areas are seeded by migration 014; tasks name theirs (docs/BLOCKS.md §3)
const areaId = name => db.prepare('SELECT id FROM areas WHERE name = ? COLLATE NOCASE').get(name)?.id ?? null;
seed('tasks', createTaskStore(db), [
    { name: 'Do laundry', minutes: 60, area: 'Home', due: day(3), repeat: { every: 1, unit: 'week' } },
    { name: 'Pay rent', minutes: 5, area: 'Home', due: day(5), repeat: { every: 1, unit: 'month', day_of_month: 1 } },
    { name: 'Email professor about office hours', priority: 'now', minutes: 5, area: 'School' },
    { name: 'Renew library books', priority: 'someday', minutes: 15, area: 'Errands' },
    { name: 'Learn to make dumplings', priority: 'someday', minutes: 120, area: 'Personal' },
    { name: 'Linear Algebra pset 4', due: day(1), priority: 'now', minutes: 120, area: 'School' },
    { name: 'OS Shell project', due: day(2), minutes: 120, area: 'School' },
    { name: 'Stripe OA', due: day(9), minutes: 60, area: 'Job search' },
    { name: 'Algorithms midterm', due: day(14), area: 'School' },
    { name: 'Book flights for Thanksgiving', due: day(30), minutes: 30, area: 'Personal' },
].map(({ area, ...task }) => ({ priority: 'soon', ...task, area_id: areaId(area) })));

seed('countdowns', createCountdownStore(db), [
    { label: 'Thanksgiving break', target_date: day(56), pinned: true },
    { label: 'Finals', target_date: day(71) },
    // a live one, ticking in its last day (docs/BLOCKS.md §4)
    { label: "New Year's!", target_date: `${new Date().getFullYear() + 1}-01-01`, target_time: '00:00', detail: 'live' },
]);

// one behind its pace, one with a step, a milestone and a dream (docs/BLOCKS.md §5)
seed('goals', createGoalStore(db), [
    { name: 'Read 12 books', current: 7, target: 12, unit: 'books', started: day(-200), deadline: day(90) },
    { name: 'Run 100 miles', current: 30, target: 100, unit: 'mi', step: 2.5, started: day(-60), deadline: day(30) },
    { name: 'LeetCode problems', current: 92, target: 150 },
    { name: 'Get an internship offer', kind: 'milestone', deadline: day(120) },
    { name: 'See the northern lights', kind: 'milestone', dream: true },
]);

// three weeks of checks, oldest first and ending today, so weekly targets
// (per_week) have a streak to show (docs/BLOCKS.md §2)
const habits = createHabitStore(db);
seed('habits', habits, [
    { name: 'Gym', position: 0, per_week: 3, pattern: 'x.x.x..' + '.x.x.x.' + 'x..x.x.' },
    { name: 'Read 30 minutes', position: 1, pattern: 'xxxxxxx' + 'xxxx.xx' + 'xxxxx.x' },
    { name: 'Chinese practice', position: 2, pattern: 'xxxxxxx' + 'xxxxxxx' + 'xx.xxxx' },
    { name: 'Sleep by midnight', position: 3, per_week: 5, pattern: 'xx.xx.x' + 'x.xxx.x' + '.xx..x.' },
], (habit, { pattern }) => {
    [...pattern].forEach((mark, i) => mark === 'x' && habits.setCheck(habit.id, day(i - (pattern.length - 1)), true));
});

seed('applications', createApplicationStore(db), [
    { company: 'Google', role: 'SWE Intern', status: 'interview', applied_on: day(-20) },
    { company: 'Stripe', role: 'Backend Intern', status: 'applied', applied_on: day(-10) },
    { company: 'Datadog', role: 'SRE Intern', status: 'applied', applied_on: day(-8) },
    { company: 'Jane Street', role: 'SWE Intern', status: 'rejected', applied_on: day(-30) },
]);

db.close();
