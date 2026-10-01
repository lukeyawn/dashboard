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
export function createStore(db, { table, columns, orderBy = 'id', filters = {}, booleans = [] }) {
    const select = ['id', ...columns, 'created_at', 'updated_at'].join(', ');
    const fromDb = row => {
        if (!row) return null;
        for (const column of booleans) row[column] = row[column] === 1;
        return row;
    };
    const toDb = values => {
        const out = {};
        for (const column of columns) {
            if (!(column in values)) continue;
            out[column] = booleans.includes(column) ? Number(values[column]) : values[column];
        }
        return out;
    };

    const getStatement = db.prepare(`SELECT ${select} FROM ${table} WHERE id = ?`);
    const removeStatement = db.prepare(`DELETE FROM ${table} WHERE id = ?`);

    return {
        // filterValues: { done: false } etc.; undefined values are ignored
        list(filterValues = {}) {
            const where = Object.entries(filterValues)
                .filter(([, value]) => value !== undefined)
                .map(([name, value]) => filters[name][String(value)]);
            const order = typeof orderBy === 'function' ? orderBy(filterValues) : orderBy;
            const sql = `SELECT ${select} FROM ${table}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order}`;
            return db.prepare(sql).all().map(fromDb);
        },

        get(id) {
            return fromDb(getStatement.get(id));
        },

        create(values) {
            const row = toDb(values);
            const names = Object.keys(row);
            const sql = names.length
                ? `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(n => `@${n}`).join(', ')}) RETURNING ${select}`
                : `INSERT INTO ${table} DEFAULT VALUES RETURNING ${select}`;
            return fromDb(db.prepare(sql).get(row));
        },

        // changes holds only the columns to change; null if there's no such row
        update(id, changes) {
            const row = toDb(changes);
            const names = Object.keys(row);
            if (names.length === 0) return this.get(id);
            const sets = names.map(n => `${n} = @${n}`).join(', ');
            const sql = `UPDATE ${table} SET ${sets}, updated_at = ${NOW} WHERE id = @id RETURNING ${select}`;
            return fromDb(db.prepare(sql).get({ ...row, id }));
        },

        // true if a row was deleted
        remove(id) {
            return removeStatement.run(id).changes === 1;
        },
    };
}

// noun:   for messages, e.g. 'task'
// schemas: { create, update, query } zod schemas from shared/schemas.js
// extend: adds routes before the generic ones, e.g. POST /:id/increment
export function crudRouter(store, { noun, create, update, query, extend }) {
    const router = express.Router();
    const notFound = id => new HttpError(404, `There's no ${noun} ${id}`);
    const idParam = req => validate(schemas.id, req.params.id);

    extend?.(router, { idParam, notFound });

    router.get('/', (req, res) => {
        res.json(store.list(validate(query, { ...req.query })));
    });

    router.post('/', (req, res) => {
        res.status(201).json(store.create(validate(create, req.body)));
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
