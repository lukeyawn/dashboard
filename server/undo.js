// Undo for the change record (DESIGN §5.5). An undo puts the item back exactly
// as it was before that change, but only if nothing has changed it since:
// otherwise it would silently throw away a later edit. Each undo is itself a
// recorded change, so it can be undone too. Rows are compared column by
// column, so a migration that adds a column doesn't block older changes
// (docs/UNDO.md).
import { HttpError } from './errors.js';

const ROW_TABLES = new Set(['tasks', 'areas', 'countdowns', 'goals', 'habits', 'applications']);
// what the record keeps alongside a deleted row, which aren't columns
const EXTRAS = new Set(['_checks', '_tasks']);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Whether a row still holds every column of a copy from the record, one
// column at a time (docs/UNDO.md §2). A column the table has gained since isn't
// in the copy, and isn't compared: any later edit to it changed updated_at,
// which is. Key order doesn't matter.
const holds = (row, copy) => Object.keys(copy).every(c => row[c] === copy[c]);

// the message for a constraint an undo ran into (docs/UNDO.md §2). SQLite names
// a failed UNIQUE constraint by its columns, not its index.
function constraintMessage(err, change) {
    const column = err.code === 'SQLITE_CONSTRAINT_UNIQUE' ? err.message.match(/UNIQUE constraint failed: (\w+\.\w+)/)?.[1] : null;
    if (column === 'countdowns.pinned') return 'Another countdown is pinned now. Unpin it, then undo this.';
    if (column === 'areas.name') return `There's an area called ${change.before.name} again since.`;
    if (column?.endsWith('.source')) return 'Another item has come from the same source since.';
    return 'Undoing this would leave it inconsistent.';
}

export function createUndo(db, log) {
    const columnsOf = table => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
    const checksOf = db.prepare('SELECT date FROM habit_checks WHERE habit_id = ? ORDER BY date DESC');
    const addCheck = db.prepare('INSERT OR IGNORE INTO habit_checks (habit_id, date) VALUES (?, ?)');
    const removeCheck = db.prepare('DELETE FROM habit_checks WHERE habit_id = ? AND date = ?');
    const rawTask = db.prepare('SELECT * FROM tasks WHERE id = ?');
    const usesArea = db.prepare('SELECT 1 FROM tasks WHERE area_id = ? LIMIT 1');
    const restoreArea = db.prepare("UPDATE tasks SET area_id = @area, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = @id AND area_id IS NULL");

    const record = (change, action, before, after) => log.record({ resource: change.resource, itemId: change.item_id, action, before, after });
    const changedSince = () => new HttpError(409, 'It has changed since, so undoing this would lose the later change. Undo the later change first.');

    // A copy with a column the table no longer has is from before a migration
    // that dropped or renamed it without rewriting the record. Undoing the
    // rest would quietly leave that column out, so it's refused (docs/UNDO.md §2).
    function checkCopies(columns, ...copies) {
        for (const copy of copies) {
            if (Object.keys(copy).some(c => !columns.has(c) && !EXTRAS.has(c))) {
                throw new HttpError(409, "That change is from before the table changed, so it can't be undone.");
            }
        }
    }

    function undoRow(change) {
        const { resource: table } = change;
        const columns = columnsOf(table);
        const read = id => db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) ?? null;
        const current = read(change.item_id);
        // a deleted habit's checks travel with it in the record
        const withChecks = row => (table === 'habits' && row ? { ...row, _checks: checksOf.all(row.id).map(r => r.date) } : row);

        if (change.action === 'create') {
            if (!current) throw new HttpError(409, "It's already gone.");
            checkCopies(columns, change.after);
            if (!holds(current, change.after)) throw changedSince();
            // deleting it here would clear it from tasks without a record of it
            if (table === 'areas' && usesArea.get(current.id)) throw new HttpError(409, 'Tasks use that area now. Delete it from Areas instead.');
            db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(current.id);
            record(change, 'delete', withChecks(current), null);
            return null;
        }

        if (change.action === 'update') {
            if (!current) throw new HttpError(409, "It's been deleted since.");
            checkCopies(columns, change.before, change.after);
            if (!holds(current, change.after)) throw changedSince();
            const names = Object.keys(change.before).filter(c => c !== 'id');
            db.prepare(`UPDATE ${table} SET ${names.map(c => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...pick(change.before, names), id: current.id });
            const restored = read(current.id);
            record(change, 'update', current, restored);
            return restored;
        }

        // a delete: put the row back, under its old id unless something has taken it since
        checkCopies(columns, change.before);
        const { _checks: checks = [], _tasks: tasks = [], ...row } = change.before;
        const names = Object.keys(row).filter(c => !(c === 'id' && current));
        if (table === 'areas' && db.prepare('SELECT 1 FROM areas WHERE name = ? COLLATE NOCASE').get(row.name)) {
            throw new HttpError(409, `There's an area called ${row.name} again since.`);
        }
        const { id } = db.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(c => `@${c}`).join(', ')}) RETURNING id`).get(pick(row, names));
        log.record({ resource: table, itemId: id, action: 'create', before: null, after: read(id) });
        for (const date of checks) addCheck.run(id, date);
        // a deleted area goes back on the tasks it was cleared from, unless they've been given another since
        for (const taskId of tasks) {
            const before = rawTask.get(taskId);
            if (restoreArea.run({ area: id, id: taskId }).changes) log.record({ resource: 'tasks', itemId: taskId, action: 'update', before, after: rawTask.get(taskId) });
        }
        return read(id);
    }

    function undoCheck(change) {
        const row = change.after ?? change.before;
        if (!db.prepare('SELECT 1 FROM habits WHERE id = ?').get(row.habit_id)) throw new HttpError(409, "That habit's been deleted since.");
        if (change.action === 'create') {
            if (removeCheck.run(row.habit_id, row.date).changes) record(change, 'delete', row, null);
        } else if (addCheck.run(row.habit_id, row.date).changes) {
            record(change, 'create', null, row);
        }
        return row;
    }

    function undoSetting(change) {
        const key = change.item_id;
        const currentRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        const current = currentRow ? { value: JSON.parse(currentRow.value) } : null;
        if (!same(current, change.after)) throw changedSince();
        if (change.before) {
            db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).run(key, JSON.stringify(change.before.value));
        } else {
            db.prepare('DELETE FROM settings WHERE key = ?').run(key);
        }
        record(change, change.before ? (current ? 'update' : 'create') : 'delete', current, change.before);
        return change.before;
    }

    const undo = db.transaction(changeId => {
        const change = log.get(changeId);
        if (!change) throw new HttpError(404, `There's no change ${changeId}`);
        if (ROW_TABLES.has(change.resource)) {
            try {
                return undoRow(change);
            } catch (err) {
                // a task put back on an area that has been deleted since
                if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') throw new HttpError(409, "Its area has been deleted since. Undo that first.");
                // a clash with another row, or a rule the row no longer meets:
                // refused like any other conflict, so Undo everything since
                // skips it and carries on
                if (err.code?.startsWith('SQLITE_CONSTRAINT')) throw new HttpError(409, constraintMessage(err, change));
                throw err;
            }
        }
        if (change.resource === 'habit_checks') return undoCheck(change);
        if (change.resource === 'settings') return undoSetting(change);
        throw new HttpError(409, "That change can't be undone.");
    });

    // Undoes every change matching the filters (actors, via, since, and the
    // agent's run), newest first, in one transaction (docs/CONNECTOR.md §6,
    // docs/AGENT.md §7). A change to an item edited since is skipped and
    // reported, never forced, so this can't overwrite the owner's own later
    // edits.
    undo.since = db.transaction(({ since, actors, via, run }) => {
        const undone = [];
        const skipped = [];
        for (const change of log.matching({ actor: actors, via, since, run })) {
            try {
                undo(change.id);
                undone.push(change);
            } catch (err) {
                if (!(err instanceof HttpError) || err.status !== 409) throw err;
                skipped.push({ change, reason: err.message });
            }
        }
        return { undone, skipped };
    });

    return undo;
}

function pick(object, keys) {
    return Object.fromEntries(keys.map(k => [k, object[k]]));
}
