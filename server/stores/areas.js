import { createStore } from '../crud.js';
import { HttpError } from '../errors.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

// The task areas: a list the owner adds to, renames, reorders and deletes;
// Claude only chooses from it (docs/BLOCKS.md §3). Names are unique ignoring
// case, so "school" finds School instead of making a second one.
export function createAreaStore(db, { log } = {}) {
    const store = createStore(db, { table: 'areas', columns: ['name', 'position'], orderBy: 'position, id', log });
    const byName = db.prepare('SELECT id FROM areas WHERE name = ? COLLATE NOCASE');
    const lastPosition = db.prepare('SELECT max(position) AS n FROM areas');
    const tasksIn = db.prepare('SELECT id FROM tasks WHERE area_id = ? ORDER BY id');
    const rawTask = db.prepare('SELECT * FROM tasks WHERE id = ?');
    const clearTask = db.prepare(`UPDATE tasks SET area_id = NULL, updated_at = ${NOW} WHERE id = ?`);

    const findExisting = ({ name }) => {
        const row = name && byName.get(name.trim());
        return row ? store.get(row.id) : null;
    };

    // Moves an area to an index in the list, renumbering the rest 0, 1, 2…
    // Each area whose place changes is a recorded update.
    function move(id, index) {
        const others = store.list().filter(a => a.id !== id);
        const order = [...others.slice(0, index), { id }, ...others.slice(index)];
        order.forEach((area, position) => {
            if (store.raw(area.id).position !== position) store.update(area.id, { position });
        });
    }

    return {
        ...store,
        findExisting,

        // a new area goes at the end of the list
        create: db.transaction(values => {
            if (findExisting(values)) throw new HttpError(409, `There's already an area called ${values.name}.`);
            return store.create({ ...values, position: (lastPosition.get().n ?? -1) + 1 });
        }),

        update: db.transaction((id, changes) => {
            if (!store.get(id)) return null;
            const { position, ...rest } = changes;
            const clash = rest.name && findExisting(rest);
            if (clash && clash.id !== id) throw new HttpError(409, `There's already an area called ${clash.name}.`);
            if (position !== undefined) move(id, position);
            return Object.keys(rest).length ? store.update(id, rest) : store.get(id);
        }),

        // Deleting an area clears it from its tasks. Each task's change is
        // recorded, and the area's delete keeps their ids, so undoing it puts
        // the area back on them, as a deleted habit's checks come back with it.
        remove: db.transaction(id => {
            const before = store.raw(id);
            if (!before) return false;
            const taskIds = tasksIn.all(id).map(row => row.id);
            for (const taskId of taskIds) {
                const taskBefore = rawTask.get(taskId);
                clearTask.run(taskId);
                log?.record({ resource: 'tasks', itemId: taskId, action: 'update', before: taskBefore, after: rawTask.get(taskId) });
            }
            db.prepare('DELETE FROM areas WHERE id = ?').run(id);
            log?.record({ resource: 'areas', itemId: id, action: 'delete', before: { ...before, _tasks: taskIds }, after: null });
            return true;
        }),
    };
}
