// The four routes every stored resource gets (DESIGN §4), and the SQL behind
// them. Resources with extra behaviour wrap or extend these.
import express from 'express';
import * as schemas from '../shared/schemas.js';
import { HttpError, validate } from './errors.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

// table:    the table name
// columns:  the columns clients may write, besides id and the timestamps
// orderBy:  SQL for the list order, or a function of the filters that returns it
// filters:  { name: { true: 'SQL', false: 'SQL' } } for ?name=true|false
// booleans: columns stored as 0/1 but sent as true/false
// json:     columns stored as JSON text but sent as objects
// log:      the change record (server/changes.js); every write is recorded in it
// sourced:  the table has a unique source column, so a create with a known source finds the existing row
export function createStore(db, { table, columns, orderBy = 'id', filters = {}, booleans = [], json = [], log = null, sourced = false }) {
    const select = ['id', ...columns, 'created_at', 'updated_at'].join(', ');
    const fromDb = row => {
        if (!row) return null;
        for (const column of booleans) row[column] = row[column] === 1;
        for (const column of json) row[column] = row[column] === null ? null : JSON.parse(row[column]);
        return row;
    };
    const toDb = values => {
        const out = {};
        for (const column of columns) {
            if (!(column in values)) continue;
            const value = values[column];
            out[column] = booleans.includes(column) ? Number(value)
                : json.includes(column) && value !== null ? JSON.stringify(value)
                : value;
        }
        return out;
    };

    const getStatement = db.prepare(`SELECT ${select} FROM ${table} WHERE id = ?`);
    const removeStatement = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
    // the whole stored row, as the change record keeps it
    const rawStatement = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
    const bySourceStatement = sourced ? db.prepare(`SELECT ${select} FROM ${table} WHERE source = ?`) : null;
    const record = (action, id, before, after) => log?.record({ resource: table, itemId: id, action, before, after });

    // rows Claude created carry claude_change: { id, at, actor, via } of that
    // change, for the ✦ mark and its Undo (docs/CONNECTOR.md §6)
    function marked(rows) {
        const marks = log?.claudeCreations(table);
        if (!marks?.size) return rows;
        for (const row of rows) {
            const mark = row && marks.get(`${row.id}|${row.created_at}`);
            if (mark) row.claude_change = mark;
        }
        return rows;
    }

    return {
        // filterValues: { done: false } etc.; undefined values are ignored
        list(filterValues = {}) {
            const where = Object.entries(filterValues)
                .filter(([, value]) => value !== undefined)
                .map(([name, value]) => filters[name][String(value)]);
            const order = typeof orderBy === 'function' ? orderBy(filterValues) : orderBy;
            const sql = `SELECT ${select} FROM ${table}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order}`;
            return marked(db.prepare(sql).all().map(fromDb));
        },

        get(id) {
            return marked([fromDb(getStatement.get(id))])[0];
        },

        raw: id => rawStatement.get(id) ?? null,

        // the row with this source, or null (DESIGN §5.5)
        findBySource(source) {
            return bySourceStatement && source ? fromDb(bySourceStatement.get(source)) : null;
        },

        create: db.transaction(values => {
            const row = toDb(values);
            const names = Object.keys(row);
            const sql = names.length
                ? `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(n => `@${n}`).join(', ')}) RETURNING ${select}`
                : `INSERT INTO ${table} DEFAULT VALUES RETURNING ${select}`;
            const created = db.prepare(sql).get(row);
            record('create', created.id, null, rawStatement.get(created.id));
            return fromDb(created);
        }),

        // changes holds only the columns to change; null if there's no such row
        update: db.transaction((id, changes) => {
            const row = toDb(changes);
            const names = Object.keys(row);
            const before = rawStatement.get(id);
            if (!before) return null;
            if (names.length === 0) return fromDb(getStatement.get(id));
            const sets = names.map(n => `${n} = @${n}`).join(', ');
            const sql = `UPDATE ${table} SET ${sets}, updated_at = ${NOW} WHERE id = @id RETURNING ${select}`;
            const updated = db.prepare(sql).get({ ...row, id });
            record('update', id, before, rawStatement.get(id));
            return fromDb(updated);
        }),

        // true if a row was deleted
        remove: db.transaction(id => {
            const before = rawStatement.get(id);
            if (!before) return false;
            removeStatement.run(id);
            record('delete', id, before, null);
            return true;
        }),
    };
}

// noun:   for messages, e.g. 'task'
// schemas: { create, update, query } zod schemas from shared/schemas.js
// extend: adds routes before the generic ones, e.g. POST /:id/increment
// defaults(values): returns values for fields a create left out, worked out per request
export function crudRouter(store, { noun, create, update, query, extend, defaults = () => ({}) }) {
    const router = express.Router();
    const notFound = id => new HttpError(404, `There's no ${noun} ${id}`);
    const idParam = req => validate(schemas.id, req.params.id);

    extend?.(router, { idParam, notFound });

    router.get('/', (req, res) => {
        res.json(store.list(validate(query, { ...req.query })));
    });

    router.post('/', (req, res) => {
        const values = validate(create, req.body);
        // an item from a source already seen is returned, not created again
        // (DESIGN §5.5); so is an area with the same name (docs/BLOCKS.md §3)
        const existing = store.findExisting?.(values) ?? store.findBySource?.(values.source);
        if (existing) return res.status(200).json(existing);
        const filled = Object.fromEntries(Object.entries(defaults(values)).filter(([key]) => values[key] === undefined));
        res.status(201).json(store.create({ ...values, ...filled }));
    });

    router.patch('/:id', (req, res) => {
        const id = idParam(req);
        const row = store.update(id, validate(update, req.body));
        if (!row) throw notFound(id);
        res.json(row);
    });

    router.delete('/:id', (req, res) => {
        const id = idParam(req);
        if (!store.remove(id)) throw notFound(id);
        res.status(204).end();
    });

    return router;
}
