import { createStore } from '../crud.js';

export function createGoalStore(db) {
    const store = createStore(db, {
        table: 'goals',
        columns: ['name', 'current', 'target', 'unit', 'archived_at'],
        orderBy: 'id',
        filters: { archived: { true: 'archived_at IS NOT NULL', false: 'archived_at IS NULL' } },
    });
    const increment = db.prepare(`
        UPDATE goals SET current = max(0, current + @by), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id
        RETURNING id`);

    return {
        ...store,
        // adds progress; a negative amount undoes a mistaken tap, never going below 0
        increment(id, by) {
            const row = increment.get({ id, by });
            return row ? store.get(row.id) : null;
        },
    };
}
