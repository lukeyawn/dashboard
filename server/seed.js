// Development data: `npm run seed`. Only fills empty tables, so it never touches real data.
import { addDays, today } from '../shared/dates.js';
import { openDatabase } from './db.js';
import { createApplicationStore } from './stores/applications.js';
import { createCountdownStore } from './stores/countdowns.js';
import { createDeadlineStore } from './stores/deadlines.js';
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
    { name: 'Do laundry' },
    { name: 'Finish OS Shell project' },
    { name: 'Email professor about office hours' },
    { name: 'Renew library books' },
]);

seed('deadlines', createDeadlineStore(db), [
    { name: 'Linear Algebra pset 4', due: day(1), course: 'M 340L' },
    { name: 'OS Shell project', due: day(2), course: 'CS 439' },
    { name: 'Stripe OA', due: day(9) },
    { name: 'Algorithms midterm', due: day(14), course: 'CS 331' },
]);

seed('countdowns', createCountdownStore(db), [
    { label: 'Thanksgiving break', target_date: day(56), pinned: true },
    { label: 'Finals', target_date: day(71) },
]);

seed('goals', createGoalStore(db), [
    { name: 'Read 12 books', current: 7, target: 12, unit: 'books' },
    { name: 'Run 100 miles', current: 64, target: 100, unit: 'mi' },
    { name: 'LeetCode problems', current: 92, target: 150 },
    { name: 'Internship applications', current: 23, target: 40 },
]);

const habits = createHabitStore(db);
seed('habits', habits, [
    { name: 'Exercise', position: 0, pattern: 'x.xx.xx' },
    { name: 'Read 30 minutes', position: 1, pattern: 'xxxxx.x' },
    { name: 'Chinese practice', position: 2, pattern: 'xx.xxxx' },
    { name: 'Sleep by midnight', position: 3, pattern: '.xx..x.' },
].map(({ pattern, ...habit }) => ({ ...habit, pattern })), (habit, { pattern }) => {
    [...pattern].forEach((mark, i) => mark === 'x' && habits.setCheck(habit.id, day(i - 6), true));
});

seed('applications', createApplicationStore(db), [
    { company: 'Google', role: 'SWE Intern', status: 'interview', applied_on: day(-20) },
    { company: 'Stripe', role: 'Backend Intern', status: 'applied', applied_on: day(-10) },
    { company: 'Datadog', role: 'SRE Intern', status: 'applied', applied_on: day(-8) },
    { company: 'Jane Street', role: 'SWE Intern', status: 'rejected', applied_on: day(-30) },
]);

db.close();
