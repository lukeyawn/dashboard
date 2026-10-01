import fs from 'node:fs';
import Database from 'better-sqlite3';

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);
const MIGRATION_FILE = /^(\d{3})-[a-z0-9-]+\.sql$/;

// Numbered SQL files, in order. Numbers must run 1, 2, 3… with no gaps, so a
// misnamed file fails loudly instead of being skipped.
export function loadMigrations(dir = MIGRATIONS_DIR) {
    const migrations = fs.readdirSync(dir)
        .filter(name => name.endsWith('.sql'))
        .sort()
        .map(name => {
            const match = MIGRATION_FILE.exec(name);
            if (!match) throw new Error(`Badly named migration: ${name}`);
            return { version: Number(match[1]), name, sql: fs.readFileSync(new URL(name, dir), 'utf8') };
        });
    migrations.forEach((m, i) => {
        if (m.version !== i + 1) throw new Error(`Migration ${m.name} should be number ${i + 1}`);
    });
    return migrations;
}

// Applies the migrations the database hasn't seen yet, each in its own
// transaction. PRAGMA user_version records how far it has got (DESIGN §2).
export function migrate(db, migrations = loadMigrations()) {
    const current = db.pragma('user_version', { simple: true });
    if (current > migrations.length) {
        throw new Error(`The database is at version ${current}, newer than this code (${migrations.length})`);
    }
    for (const m of migrations.slice(current)) {
        db.transaction(() => {
            db.exec(m.sql);
            db.pragma(`user_version = ${m.version}`);
        })();
    }
}

export function openDatabase(file = ':memory:') {
    const db = new Database(file);
    // WAL lets reads continue during writes, and Litestream needs it (DESIGN §11)
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    migrate(db);
    return db;
}
