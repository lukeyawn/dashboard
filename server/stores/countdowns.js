import { createStore } from '../crud.js';

// At most one countdown is pinned: pinning one unpins the rest (DESIGN §10, Countdown)
export function createCountdownStore(db) {
    const store = createStore(db, {
        table: 'countdowns',
        columns: ['label', 'target_date', 'pinned'],
        orderBy: 'target_date, id',
        booleans: ['pinned'],
    });
    const unpinOthers = db.prepare('UPDATE countdowns SET pinned = 0 WHERE pinned = 1 AND id IS NOT ?');

    return {
        ...store,
        create: db.transaction(values => {
            if (values.pinned) unpinOthers.run(null);
            return store.create(values);
        }),
        update: db.transaction((id, changes) => {
            if (changes.pinned && store.get(id)) unpinOthers.run(id);
            return store.update(id, changes);
        }),
    };
}
