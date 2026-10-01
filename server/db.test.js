import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { loadMigrations, migrate, openDatabase } from './db.js';

const tempDirs = [];
function tempDir(files = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-test-'));
    tempDirs.push(dir);
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
    return pathToFileURL(dir + '/');
}
afterEach(() => {
    while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe('migrations', () => {
    it('run from zero and record the version', () => {
        const db = openDatabase();
        expect(db.pragma('user_version', { simple: true })).toBe(loadMigrations().length);
        expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").get()).toBeTruthy();
    });

    it('change nothing when run again', () => {
        const db = openDatabase();
        db.prepare("INSERT INTO tasks (name) VALUES ('keep me')").run();
        const schema = () => db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
        const before = schema();
        migrate(db);
        expect(schema()).toEqual(before);
        expect(db.prepare('SELECT count(*) AS n FROM tasks').get().n).toBe(1);
    });

    it('apply only the new ones to an existing database', () => {
        const dir = tempDir({ '001-a.sql': 'CREATE TABLE a (x INTEGER) STRICT;' });
        const db = new Database(':memory:');
        migrate(db, loadMigrations(dir));
        fs.writeFileSync(new URL('002-b.sql', dir), 'CREATE TABLE b (y INTEGER) STRICT;');
        migrate(db, loadMigrations(dir));
        expect(db.pragma('user_version', { simple: true })).toBe(2);
        expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('a', 'b')").get().n).toBe(2);
    });

    it('roll back a migration that fails partway', () => {
        const dir = tempDir({ '001-bad.sql': 'CREATE TABLE ok (x INTEGER); CREATE TABLE broken (;' });
        const db = new Database(':memory:');
        expect(() => migrate(db, loadMigrations(dir))).toThrow();
        expect(db.pragma('user_version', { simple: true })).toBe(0);
        expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'ok'").get().n).toBe(0);
    });

    it('refuse a database newer than the code', () => {
        const db = new Database(':memory:');
        db.pragma('user_version = 99');
        expect(() => migrate(db)).toThrow('newer than this code');
    });

    it('refuse badly named or misnumbered files', () => {
        expect(() => loadMigrations(tempDir({ '1-short.sql': '' }))).toThrow('Badly named');
        expect(() => loadMigrations(tempDir({ '001-a.sql': '', '003-c.sql': '' }))).toThrow('should be number 2');
    });
});

describe('openDatabase', () => {
    it('turns on foreign keys and WAL for a file', () => {
        const dir = tempDir();
        const db = openDatabase(new URL('test.db', dir).pathname);
        expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
        expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
        db.close();
    });
});
