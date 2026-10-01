import { createStore } from '../crud.js';

// One list for to-dos and deadlines: a task with a due date is a deadline (DESIGN §3)
export const TASK_COLUMNS = ['name', 'done_at', 'due', 'priority', 'effort', 'area', 'notes', 'link', 'source'];

export function createTaskStore(db, { log } = {}) {
    return createStore(db, {
        table: 'tasks',
        columns: TASK_COLUMNS,
        // in the order they were created; done ones newest first, for restoring.
        // The tiles sort for display themselves (DESIGN §10).
        orderBy: ({ done }) => (done === true ? 'done_at DESC, id DESC' : 'id'),
        filters: { done: { true: 'done_at IS NOT NULL', false: 'done_at IS NULL' } },
        log,
        sourced: true,
    });
}
