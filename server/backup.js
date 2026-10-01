// The full JSON export and nightly snapshots (DESIGN §2, Data durability).
import fs from 'node:fs';
import path from 'node:path';

// Every table as plain rows, so the data stays readable without SQLite
export function exportAll(db, now = new Date()) {
    const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name`).all().map(row => row.name);
    return {
        exported_at: now.toISOString(),
        schema_version: db.pragma('user_version', { simple: true }),
        tables: Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT * FROM "${name}"`).all()])),
    };
}

// Writes dashboard-<label>.db, a consistent copy made with VACUUM INTO, and
// dashboard-<label>.json, the export. Returns both paths. VACUUM INTO only
// reads, so the server can keep writing while it runs.
export function snapshot(db, dir, label, now = new Date()) {
    fs.mkdirSync(dir, { recursive: true });
    const dbPath = path.join(dir, `dashboard-${label}.db`);
    const jsonPath = path.join(dir, `dashboard-${label}.json`);
    fs.rmSync(dbPath, { force: true });
    db.prepare('VACUUM INTO ?').run(dbPath);
    fs.writeFileSync(jsonPath, JSON.stringify(exportAll(db, now), null, 1) + '\n');
    return { dbPath, jsonPath };
}

// Keeps the newest `keep` dated snapshots (dashboard-YYYY-MM-DD.*) and deletes the
// rest. Other files, such as pre-deploy snapshots, are left alone. Returns what it deleted.
export function prune(dir, keep) {
    const dated = /^dashboard-(\d{4}-\d{2}-\d{2})\.(db|json)$/;
    const dates = [...new Set(fs.readdirSync(dir).map(name => dated.exec(name)?.[1]).filter(Boolean))].sort().reverse();
    const old = new Set(dates.slice(keep));
    const deleted = fs.readdirSync(dir).filter(name => old.has(dated.exec(name)?.[1]));
    deleted.forEach(name => fs.rmSync(path.join(dir, name)));
    return deleted;
}
