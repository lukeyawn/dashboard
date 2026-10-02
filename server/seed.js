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

seed('tasks', createTaskStore(db), [
    { name: 'Do laundry', effort: 'medium', area: 'home' },
    { name: 'Email professor about office hours', priority: 'high', effort: 'quick' },
    { name: 'Renew library books', priority: 'low', effort: 'quick' },
    { name: 'Linear Algebra pset 4', due: day(1), priority: 'high', effort: 'big', area: 'M 340L' },
    { name: 'OS Shell project', due: day(2), effort: 'big', area: 'CS 439' },
    { name: 'Stripe OA', due: day(9), area: 'job search' },
    { name: 'Algorithms midterm', due: day(14), area: 'CS 331' },
    { name: 'Book flights for Thanksgiving', due: day(30) },
].map(task => ({ priority: 'normal', ...task })));

seed('countdowns', createCountdownStore(db), [
    { label: 'Thanksgiving break', target_date: day(56), pinned: true },
    { label: 'Finals', target_date: day(71) },
    // a live one, ticking in its last day (docs/BLOCKS.md §4)
    { label: "New Year's!", target_date: `${new Date().getFullYear() + 1}-01-01`, target_time: '00:00', detail: 'live' },
]);

seed('goals', createGoalStore(db), [
    { name: 'Read 12 books', current: 7, target: 12, unit: 'books' },
    { name: 'Run 100 miles', current: 64, target: 100, unit: 'mi' },
    { name: 'LeetCode problems', current: 92, target: 150 },
    { name: 'Internship applications', current: 23, target: 40 },
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
