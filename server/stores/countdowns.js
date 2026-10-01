import { createStore } from '../crud.js';

// At most one countdown is pinned: pinning one unpins the rest (DESIGN §10, Countdown)
export function createCountdownStore(db, { log } = {}) {
    const store = createStore(db, {
        table: 'countdowns',
        columns: ['label', 'target_date', 'pinned', 'source'],
        orderBy: 'target_date, id',
        booleans: ['pinned'],
        log,
        sourced: true,
    });
    const pinnedOthers = db.prepare('SELECT id FROM countdowns WHERE pinned = 1 AND id IS NOT ?');
    // through the store, so each unpinning is in the change record too
    const unpinOthers = id => pinnedOthers.all(id).forEach(row => store.update(row.id, { pinned: false }));

    return {
        ...store,
        create: db.transaction(values => {
            if (values.pinned) unpinOthers(null);
            return store.create(values);
        }),
        update: db.transaction((id, changes) => {
            if (changes.pinned && store.get(id)) unpinOthers(id);
            return store.update(id, changes);
        }),
    };
}
