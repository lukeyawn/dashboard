import { createStore } from '../crud.js';

// applied → interview → offer. Rejected is set only by an edit (DESIGN §10, Job search).
export const NEXT_STATUS = { applied: 'interview', interview: 'offer' };

export function createApplicationStore(db) {
    const store = createStore(db, {
        table: 'applications',
        columns: ['company', 'role', 'status', 'applied_on', 'url', 'notes'],
        // the widget shows the most recently updated first
        orderBy: 'updated_at DESC, id DESC',
        filters: {
            status: Object.fromEntries(['applied', 'interview', 'offer', 'rejected'].map(s => [s, `status = '${s}'`])),
        },
    });

    return {
        ...store,
        // the next status, or undefined when there is no next one; null if there's no such application
        advance(id) {
            const row = store.get(id);
            if (!row) return null;
            const next = NEXT_STATUS[row.status];
            return next ? store.update(id, { status: next }) : undefined;
        },
    };
}
