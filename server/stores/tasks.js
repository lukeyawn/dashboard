import { createStore } from '../crud.js';

export function createTaskStore(db) {
    return createStore(db, {
        table: 'tasks',
        columns: ['name', 'done_at'],
        // open ones in the order they were created (DESIGN §10); done ones newest first, for restoring
        orderBy: ({ done }) => (done === true ? 'done_at DESC, id DESC' : 'id'),
        filters: { done: { true: 'done_at IS NOT NULL', false: 'done_at IS NULL' } },
    });
}
