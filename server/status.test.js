import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BACKUP_STALE_MS, CALENDAR_FAILING_MS, problems, readBackupStatus, systemStatus } from './status.js';

const NOW = Date.parse('2026-10-02T15:00:00Z');
const ago = ms => new Date(NOW - ms).toISOString();

describe('problems', () => {
    it('finds none when everything is fine or has never run', () => {
        expect(problems({ backup: { at: ago(60_000), ok: true }, calendar: { configured: true, failing_since: null } }, NOW)).toEqual([]);
        expect(problems({ backup: null, calendar: null }, NOW)).toEqual([]);
    });

    it('reports a failed backup, naming the step', () => {
        expect(problems({ backup: { at: ago(60_000), ok: false, step: 'drive' } }, NOW))
            .toEqual([{ kind: 'backup', message: 'The last backup failed (drive)' }]);
    });

    it('reports a backup that has not run in over 36 hours', () => {
        expect(problems({ backup: { at: ago(BACKUP_STALE_MS - 1000), ok: true } }, NOW)).toEqual([]);
        expect(problems({ backup: { at: ago(BACKUP_STALE_MS + 1000), ok: true } }, NOW)[0].message).toBe('No backup in over a day');
    });

    it('reports a calendar feed only after an hour of failing', () => {
        const failing = since => ({ calendar: { configured: true, failing_since: ago(since) } });
        expect(problems(failing(CALENDAR_FAILING_MS - 1000), NOW)).toEqual([]);
        expect(problems(failing(CALENDAR_FAILING_MS + 1000), NOW)[0].kind).toBe('calendar');
        expect(problems({ calendar: { configured: false, failing_since: ago(CALENDAR_FAILING_MS * 2) } }, NOW)).toEqual([]);
    });
});

describe('readBackupStatus', () => {
    const dirs = [];
    afterEach(() => dirs.splice(0).forEach(d => fs.rmSync(d, { recursive: true, force: true })));
    const file = content => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-'));
        dirs.push(dir);
        const f = path.join(dir, 'last-run.json');
        if (content !== undefined) fs.writeFileSync(f, content);
        return f;
    };

    it('reads what backup.sh wrote, and treats a missing or broken file as never run', () => {
        expect(readBackupStatus(file('{"at":"2026-10-02T08:00:00Z","ok":true,"step":"complete"}'))).toEqual({ at: '2026-10-02T08:00:00Z', ok: true, step: 'complete' });
        expect(readBackupStatus(file())).toBeNull();
        expect(readBackupStatus(file('{broken'))).toBeNull();
        expect(readBackupStatus(null)).toBeNull();
    });

    it('combines everything in systemStatus', () => {
        const status = systemStatus({
            backupStatusFile: file('{"at":"2026-10-02T08:00:00Z","ok":false,"step":"snapshot"}'),
            calendar: { status: () => ({ configured: true, failing_since: null }) },
            now: NOW,
        });
        expect(status.problems).toEqual([{ kind: 'backup', message: 'The last backup failed (snapshot)' }]);
        expect(status.calendar.configured).toBe(true);
    });
});

describe('connector problems', () => {
    it('reports a lost connection and a used-up day, per connector', () => {
        const connectors = [{ name: 'chat', lost: true, capped: true }, { name: 'agent', lost: true, capped: false }];
        expect(problems({ connectors }, 0)).toEqual([
            { kind: 'connector-chat', message: 'claude.ai disconnected: reconnect' },
            { kind: 'connector-chat-limit', message: "claude.ai used up today's changes" },
            { kind: 'connector-agent', message: "claude.ai's agent connector disconnected: reconnect" },
        ]);
        expect(problems({ connectors: [{ name: 'chat', lost: false, capped: false }] }, 0)).toEqual([]);
    });
});
