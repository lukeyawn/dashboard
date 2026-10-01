// The health of the parts that run on their own (DESIGN §5.5): the nightly
// backup and the calendar feed. The dock shows a warning only for a problem.
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

export function problems({ backup, calendar }, now) {
    const found = [];
    if (backup && !backup.ok) {
        found.push({ kind: 'backup', message: `The last backup failed${backup.step ? ` (${backup.step})` : ''}` });
    } else if (backup && now - Date.parse(backup.at) > BACKUP_STALE_MS) {
        found.push({ kind: 'backup', message: 'No backup in over a day' });
    }
    if (calendar?.configured && calendar.failing_since && now - Date.parse(calendar.failing_since) > CALENDAR_FAILING_MS) {
        found.push({ kind: 'calendar', message: 'The calendar isn\'t updating' });
    }
    return found;
}

export function systemStatus({ backupStatusFile, calendar, now }) {
    const parts = {
        backup: readBackupStatus(backupStatusFile),
        calendar: calendar.status?.() ?? null,
    };
    return { ...parts, problems: problems(parts, now) };
}
