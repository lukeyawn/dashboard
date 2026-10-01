// The health of the parts that run on their own (DESIGN §5.5): the nightly
// backup, the calendar feed, and the claude.ai connectors. The dock shows a
// warning only for a problem.
import fs from 'node:fs';

export const BACKUP_STALE_MS = 36 * 60 * 60 * 1000;
export const CALENDAR_FAILING_MS = 60 * 60 * 1000;

// what vm/backup.sh last recorded, or null if it has never run here
export function readBackupStatus(file) {
    if (!file) return null;
    try {
        const { at, ok, step } = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { at, ok: ok === true, step: step ?? null };
    } catch {
        return null;
    }
}

export function problems({ backup, calendar, connectors = [] }, now) {
    const found = [];
    if (backup && !backup.ok) {
        found.push({ kind: 'backup', message: `The last backup failed${backup.step ? ` (${backup.step})` : ''}` });
    } else if (backup && now - Date.parse(backup.at) > BACKUP_STALE_MS) {
        found.push({ kind: 'backup', message: 'No backup in over a day' });
    }
    if (calendar?.configured && calendar.failing_since && now - Date.parse(calendar.failing_since) > CALENDAR_FAILING_MS) {
        found.push({ kind: 'calendar', message: 'The calendar isn\'t updating' });
    }
    // a connection that ended without the owner ending it: expired, or revoked
    // because its token was copied (docs/CONNECTOR.md §4)
    for (const c of connectors) {
        const who = c.name === 'chat' ? 'claude.ai' : "claude.ai's agent connector";
        if (c.lost) found.push({ kind: `connector-${c.name}`, message: `${who} disconnected: reconnect` });
        if (c.capped) found.push({ kind: `connector-${c.name}-limit`, message: `${who} used up today's changes` });
    }
    return found;
}

// connectors: () => [{ name, lost, capped }] for the configured connectors
export function systemStatus({ backupStatusFile, calendar, now, connectors = () => [] }) {
    const parts = {
        backup: readBackupStatus(backupStatusFile),
        calendar: calendar.status?.() ?? null,
        connectors: connectors(),
    };
    return { ...parts, problems: problems(parts, now) };
}
