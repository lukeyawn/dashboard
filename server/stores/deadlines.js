import { createStore } from '../crud.js';

export function createDeadlineStore(db) {
    return createStore(db, {
        table: 'deadlines',
        columns: ['name', 'due', 'course', 'done_at'],
        orderBy: 'due, id',
        filters: { done: { true: 'done_at IS NOT NULL', false: 'done_at IS NULL' } },
    });
}
