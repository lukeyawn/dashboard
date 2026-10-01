import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db.js';
import { createTaskStore } from './tasks.js';

let db;
let tasks;
beforeEach(() => {
    db = openDatabase();
    tasks = createTaskStore(db);
});

describe('task store', () => {
    it('starts empty', () => {
        expect(tasks.list()).toEqual([]);
        expect(tasks.list({ done: false })).toEqual([]);
        expect(tasks.list({ done: true })).toEqual([]);
    });

    it('creates a task with timestamps and no done_at', () => {
        const task = tasks.create({ name: 'Do laundry' });
        expect(task).toMatchObject({ id: 1, name: 'Do laundry', done_at: null });
        expect(task.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(task.updated_at).toBe(task.created_at);
        expect(tasks.get(1)).toEqual(task);
    });

    it('lists open tasks in creation order and done ones newest first', () => {
        const a = tasks.create({ name: 'a' });
        const b = tasks.create({ name: 'b' });
        const c = tasks.create({ name: 'c' });
        tasks.update(a.id, { done_at: '2026-09-30T10:00:00.000Z' });
        tasks.update(c.id, { done_at: '2026-09-30T11:00:00.000Z' });
        expect(tasks.list({ done: false }).map(t => t.name)).toEqual(['b']);
        expect(tasks.list({ done: true }).map(t => t.name)).toEqual(['c', 'a']);
        expect(tasks.list().map(t => t.name)).toEqual(['a', 'b', 'c']);
        expect(b.done_at).toBeNull();
    });

    it('updates only the given columns', () => {
        const task = tasks.create({ name: 'old' });
        const renamed = tasks.update(task.id, { name: 'new' });
        expect(renamed).toMatchObject({ name: 'new', done_at: null });
        const done = tasks.update(task.id, { done_at: '2026-09-30T10:00:00.000Z' });
        expect(done).toMatchObject({ name: 'new', done_at: '2026-09-30T10:00:00.000Z' });
        expect(tasks.update(task.id, { done_at: null }).done_at).toBeNull();
    });

    it('ignores unknown columns, and returns the task unchanged when nothing is left', () => {
        const task = tasks.create({ name: 'x' });
        expect(tasks.update(task.id, { id: 99, created_at: 'never' })).toEqual(task);
    });

    it('returns null when updating a task that does not exist', () => {
        expect(tasks.update(42, { name: 'nope' })).toBeNull();
        expect(tasks.get(42)).toBeNull();
    });

    it('deletes, and reports whether anything was deleted', () => {
        const task = tasks.create({ name: 'x' });
        expect(tasks.remove(task.id)).toBe(true);
        expect(tasks.remove(task.id)).toBe(false);
        expect(tasks.list()).toEqual([]);
    });

    it('has the database itself reject empty and overlong names', () => {
        expect(() => tasks.create({ name: '   ' })).toThrow(/CHECK constraint/);
        expect(() => tasks.create({ name: 'x'.repeat(201) })).toThrow(/CHECK constraint/);
        expect(() => tasks.create({ name: null })).toThrow(/NOT NULL/);
    });
});
