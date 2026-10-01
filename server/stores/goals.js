import { createStore } from '../crud.js';

export function createGoalStore(db, { log } = {}) {
    const store = createStore(db, {
        table: 'goals',
        columns: ['name', 'current', 'target', 'unit', 'archived_at'],
        orderBy: 'id',
        filters: { archived: { true: 'archived_at IS NOT NULL', false: 'archived_at IS NULL' } },
        log,
    });
    const increment = db.prepare(`
        UPDATE goals SET current = max(0, current + @by), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`);

    return {
        ...store,
        // adds progress; a negative amount undoes a mistaken tap, never going below 0
        increment: db.transaction((id, by) => {
            const before = store.raw(id);
            if (!before) return null;
            increment.run({ id, by });
            log?.record({ resource: 'goals', itemId: id, action: 'update', before, after: store.raw(id) });
            return store.get(id);
        }),
    };
}
