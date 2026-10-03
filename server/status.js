// The health of the parts that run on their own (DESIGN §5.5): the nightly
// backup, the calendar feeds, the claude.ai connectors and the scheduled
// agent's runs. The dock shows a warning only for a problem.
import fs from 'node:fs';
import { RUN_OPEN_MS } from './stores/runs.js';

export const BACKUP_STALE_MS = 36 * 60 * 60 * 1000;
export const CALENDAR_FAILING_MS = 60 * 60 * 1000;
// the agent is expected to run at least once a day (docs/AGENT.md §7)
export const RUN_STALE_MS = 26 * 60 * 60 * 1000;

// "Tue 7:02 AM", in the dashboard's time zone
const when = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

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

// agent: { latest } (the newest run, or null) while the agent's connector is
// set up and switched on, otherwise null
export function problems({ backup, calendar, connectors = [], agent = null }, now) {
    const found = [];
    if (backup && !backup.ok) {
        found.push({ kind: 'backup', message: `The last backup failed${backup.step ? ` (${backup.step})` : ''}` });
    } else if (backup && now - Date.parse(backup.at) > BACKUP_STALE_MS) {
        found.push({ kind: 'backup', message: 'No backup in over a day' });
    }
    const failing = feed => feed?.configured && feed.failing_since && now - Date.parse(feed.failing_since) > CALENDAR_FAILING_MS;
    if (failing(calendar)) found.push({ kind: 'calendar', message: 'The calendar isn\'t updating' });
    if (failing(calendar?.routine)) found.push({ kind: 'calendar-routine', message: 'The classes calendar isn\'t updating' });
    // a connection that ended without the owner ending it: expired, or revoked
    // because its token was copied (docs/CONNECTOR.md §4)
    for (const c of connectors) {
        const who = c.name === 'chat' ? 'claude.ai' : "claude.ai's agent connector";
        if (c.lost) found.push({ kind: `connector-${c.name}`, message: `${who} disconnected: reconnect` });
        if (c.capped) {
            const message = c.name === 'agent' ? `Today's limit of ${c.cap} agent changes is used up` : `${who} used up today's changes`;
            found.push({ kind: `connector-${c.name}-limit`, message });
        }
    }
    const run = agent?.latest;
    if (run && now - Date.parse(run.started_at) > RUN_STALE_MS) {
        found.push({ kind: 'agent-runs', message: `The agent hasn't run since ${when(run.started_at)}` });
    } else if (run && !run.ended_at && now - Date.parse(run.started_at) > RUN_OPEN_MS) {
        const which = run.name ? `${run.name} run` : 'run';
        found.push({ kind: 'agent-runs', message: `The agent's ${which} from ${when(run.started_at)} didn't report` });
    }
    return found;
}

// connectors: () => [{ name, lost, capped, cap }] for the configured connectors
// agent: () => { latest } or null, as problems() takes it
export function systemStatus({ backupStatusFile, calendar, now, connectors = () => [], agent = () => null }) {
    const parts = {
        backup: readBackupStatus(backupStatusFile),
        calendar: calendar.status?.() ?? null,
        connectors: connectors(),
        agent: agent(),
    };
    return { ...parts, problems: problems(parts, now) };
}
