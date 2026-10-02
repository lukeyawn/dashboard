import { today } from '../../shared/dates.js';
import { nextOccurrence } from '../../shared/repeat.js';
import { createStore } from '../crud.js';
import { HttpError } from '../errors.js';

// One list for to-dos and deadlines: a task with a due date is a deadline (DESIGN §3)
export const TASK_COLUMNS = ['name', 'done_at', 'due', 'priority', 'area_id', 'minutes', 'notes', 'link', 'source', 'repeat', 'last_done_at'];

// Each task comes back with its area's name as `area`, for the tiles and for
// Claude. Completing a recurring task moves its due date to the next
// occurrence instead, and records when it was done (docs/BLOCKS.md §3).
export function createTaskStore(db, { log, now = () => new Date() } = {}) {
    const store = createStore(db, {
        table: 'tasks',
        columns: TASK_COLUMNS,
        // in the order they were created; done ones newest first, for restoring.
        // The tiles sort for display themselves (DESIGN §10).
        orderBy: ({ done }) => (done === true ? 'done_at DESC, id DESC' : 'id'),
        filters: { done: { true: 'done_at IS NOT NULL', false: 'done_at IS NULL' } },
        json: ['repeat'],
        log,
        sourced: true,
    });
    const areas = db.prepare('SELECT id, name FROM areas ORDER BY position, id');

    function named(rows) {
        const names = new Map(areas.all().map(a => [a.id, a.name]));
        for (const row of rows) if (row) row.area = row.area_id === null ? null : (names.get(row.area_id) ?? null);
        return rows;
    }
    const one = row => named([row])[0];

    // Claude can only choose an area, so an unknown one is refused with the list
    function checkArea(areaId) {
        if (areaId === undefined || areaId === null) return;
        const list = areas.all();
        if (list.some(a => a.id === areaId)) return;
        throw new HttpError(400, `There's no area ${areaId}. The areas are: ${list.map(a => `${a.name} (${a.id})`).join(', ')}.`);
    }

    return {
        ...store,
        list: filters => named(store.list(filters)),
        get: id => one(store.get(id)),
        findBySource: source => one(store.findBySource(source)),

        create: db.transaction(values => {
            checkArea(values.area_id);
            return one(store.create(values));
        }),

        update: db.transaction((id, changes) => {
            const before = store.get(id);
            if (!before) return null;
            checkArea(changes.area_id);
            const merged = { ...before, ...changes };
            if (merged.repeat && !merged.due) throw new HttpError(400, 'A recurring task needs a due date. Clear the repeat rule first.');
            // completing a recurring task rolls it forward: one update, so Undo works as usual
            if (changes.done_at && merged.repeat && !before.done_at) {
                const { done_at: doneAt, ...rest } = changes;
                changes = { ...rest, due: nextOccurrence(merged.repeat, merged.due, today(now())), last_done_at: doneAt };
            }
            return one(store.update(id, changes));
        }),
    };
}
