import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { exportAll, prune, snapshot } from './backup.js';
import { openDatabase } from './db.js';
import { createHabitStore } from './stores/habits.js';
import { createTaskStore } from './stores/tasks.js';

const dirs = [];
function tempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'));
    dirs.push(dir);
    return dir;
}
afterEach(() => {
    while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});

function filledDatabase() {
    const db = openDatabase();
    createTaskStore(db).create({ name: 'Do laundry' });
    const habits = createHabitStore(db);
    const habit = habits.create({ name: 'Read' });
    habits.setCheck(habit.id, '2026-09-30', true);
    return db;
}

describe('exportAll', () => {
    it('includes every table, its rows and the schema version', () => {
        const db = filledDatabase();
        const data = exportAll(db, new Date('2026-10-01T08:00:00Z'));
        expect(data.exported_at).toBe('2026-10-01T08:00:00.000Z');
        expect(data.schema_version).toBe(db.pragma('user_version', { simple: true }));
        expect(Object.keys(data.tables)).toEqual(['applications', 'areas', 'changes', 'countdowns', 'goals', 'habit_checks', 'habits', 'settings', 'tasks']);
        expect(data.tables.tasks[0].name).toBe('Do laundry');
        expect(data.tables.habit_checks).toEqual([{ habit_id: 1, date: '2026-09-30' }]);
    });
});

describe('snapshot', () => {
    it('writes a database that opens on its own, and the export beside it', () => {
        const dir = tempDir();
        const db = filledDatabase();
        const { dbPath, jsonPath } = snapshot(db, path.join(dir, 'nested'), '2026-10-01');
        const copy = new Database(dbPath, { readonly: true });
        expect(copy.prepare('SELECT name FROM tasks').all()).toEqual([{ name: 'Do laundry' }]);
        copy.close();
        expect(JSON.parse(fs.readFileSync(jsonPath, 'utf8')).tables.tasks).toHaveLength(1);
    });

    it('replaces a snapshot taken earlier with the same label', () => {
        const dir = tempDir();
        const db = filledDatabase();
        snapshot(db, dir, '2026-10-01');
        createTaskStore(db).create({ name: 'Second' });
        const { dbPath } = snapshot(db, dir, '2026-10-01');
        const copy = new Database(dbPath, { readonly: true });
        expect(copy.prepare('SELECT count(*) AS n FROM tasks').get().n).toBe(2);
        copy.close();
    });
});

describe('prune', () => {
    it('keeps the newest dated snapshots and leaves other files alone', () => {
        const dir = tempDir();
        const names = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].flatMap(d => [`dashboard-${d}.db`, `dashboard-${d}.json`]);
        for (const name of [...names, 'dashboard-pre-deploy-abc123.db', 'notes.txt']) fs.writeFileSync(path.join(dir, name), '');
        const deleted = prune(dir, 2);
        expect(deleted.sort()).toEqual(['dashboard-2026-09-28.db', 'dashboard-2026-09-28.json', 'dashboard-2026-09-29.db', 'dashboard-2026-09-29.json']);
        expect(fs.readdirSync(dir).sort()).toEqual([
            'dashboard-2026-09-30.db', 'dashboard-2026-09-30.json', 'dashboard-2026-10-01.db', 'dashboard-2026-10-01.json',
            'dashboard-pre-deploy-abc123.db', 'notes.txt',
        ]);
    });
});
