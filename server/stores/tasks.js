// All SQL for tasks. Routes and tests go through these functions.

const COLUMNS = 'id, name, done_at, created_at, updated_at';

export function createTaskStore(db) {
    const statements = {
        all: db.prepare(`SELECT ${COLUMNS} FROM tasks ORDER BY id`),
        open: db.prepare(`SELECT ${COLUMNS} FROM tasks WHERE done_at IS NULL ORDER BY id`),
        done: db.prepare(`SELECT ${COLUMNS} FROM tasks WHERE done_at IS NOT NULL ORDER BY done_at DESC, id DESC`),
        get: db.prepare(`SELECT ${COLUMNS} FROM tasks WHERE id = ?`),
        insert: db.prepare(`INSERT INTO tasks (name) VALUES (@name) RETURNING ${COLUMNS}`),
        remove: db.prepare('DELETE FROM tasks WHERE id = ?'),
    };

    return {
        // done: undefined for every task, false for open ones, true for completed ones
        list({ done } = {}) {
            if (done === false) return statements.open.all();
            if (done === true) return statements.done.all();
            return statements.all.all();
        },

        get(id) {
            return statements.get.get(id) ?? null;
        },

        create({ name }) {
            return statements.insert.get({ name });
        },

        // changes holds only the columns to change; returns null if there's no such task
        update(id, changes) {
            const columns = Object.keys(changes).filter(key => key === 'name' || key === 'done_at');
            if (columns.length === 0) return this.get(id);
            const sets = columns.map(c => `${c} = @${c}`).join(', ');
            const row = db.prepare(
                `UPDATE tasks SET ${sets}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = @id RETURNING ${COLUMNS}`,
            ).get({ ...pick(changes, columns), id });
            return row ?? null;
        },

        // true if a task was deleted
        remove(id) {
            return statements.remove.run(id).changes === 1;
        },
    };
}

function pick(object, keys) {
    return Object.fromEntries(keys.map(k => [k, object[k]]));
}
