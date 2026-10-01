// vm/backup.sh, run for real on a temporary database, with a fake rclone.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../server/db.js';

const SCRIPT = new URL('./backup.sh', import.meta.url).pathname;
let dir;
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function runBackup({ rcloneFails = false } = {}) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-sh-'));
    const database = path.join(dir, 'dashboard.db');
    openDatabase(database).close();
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.writeFileSync(path.join(dir, 'bin', 'rclone'), `#!/bin/sh\necho "$@" >> "${dir}/rclone.log"\nexit ${rcloneFails ? 1 : 0}\n`, { mode: 0o755 });
    const env = {
        PATH: `${dir}/bin:${process.env.PATH}`,
        DATABASE: database,
        BACKUP_DIR: path.join(dir, 'backups'),
        DRIVE_FOLDER: 'drive:test',
        TZ: 'America/Chicago',
    };
    const outcome = await promisify(execFile)('bash', [SCRIPT], { env }).then(() => 0, err => err.code);
    const status = JSON.parse(fs.readFileSync(path.join(dir, 'backups', 'last-run.json'), 'utf8'));
    return { outcome, status, backups: fs.readdirSync(path.join(dir, 'backups')) };
}

describe('backup.sh', () => {
    it('snapshots, copies to Drive, and records success', async () => {
        const { outcome, status, backups } = await runBackup();
        expect(outcome).toBe(0);
        expect(status).toMatchObject({ ok: true, step: 'complete' });
        expect(Date.now() - Date.parse(status.at)).toBeLessThan(60_000);
        expect(backups.some(f => /^dashboard-\d{4}-\d{2}-\d{2}\.db$/.test(f))).toBe(true);
        expect(fs.readFileSync(path.join(dir, 'rclone.log'), 'utf8')).toContain('copy');
    });

    it('records a failed Drive copy, and fails', async () => {
        const { outcome, status } = await runBackup({ rcloneFails: true });
        expect(outcome).not.toBe(0);
        expect(status).toMatchObject({ ok: false, step: 'drive' });
    });
});
