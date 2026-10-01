// Development data: `npm run seed`. Only fills empty tables, so it never touches real data.
import { openDatabase } from './db.js';
import { createTaskStore } from './stores/tasks.js';

const db = openDatabase(process.env.DATABASE ?? 'data/dashboard.db');
const tasks = createTaskStore(db);

if (tasks.list().length === 0) {
    for (const name of ['Do laundry', 'Finish OS Shell project', 'Email professor about office hours', 'Renew library books']) {
        tasks.create({ name });
    }
    console.log('Added sample tasks.');
} else {
    console.log('Tasks already exist; left them alone.');
}

db.close();
