// The scheduled agent's runs (docs/AGENT.md §7). The agent names each run
// with a label it chooses and passes on every change; the first change with
// a new label opens the run, on the server's clock, and report_run closes
// it. The change record keeps which run each change belongs to, so a run's
// changes can be listed and undone together even when two runs overlap.
import { RUN_OPEN_MS } from '../../shared/runs.js';
import { HttpError } from '../errors.js';

export { RUN_OPEN_MS };

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

// "7:09 AM", in the dashboard's time zone, for the agent to read
const clock = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// runsPerDay: () => the most runs connectors may open a day; dayStart: () =>
// the start of today, as an ISO timestamp
export function createRunStore(db, { now = () => new Date(), runsPerDay = () => Infinity, dayStart = () => '' } = {}) {
    const insert = db.prepare('INSERT INTO runs (label, started_at, connection_id) VALUES (?, ?, ?)');
    const getRow = db.prepare('SELECT * FROM runs WHERE id = ?');
    const byLabel = db.prepare('SELECT * FROM runs WHERE label = ?');
    const reportRow = db.prepare(`UPDATE runs SET ended_at = ?, summary = ?, briefing = ?, updated_at = ${NOW} WHERE id = ?`);
    const latestRow = db.prepare('SELECT * FROM runs ORDER BY started_at DESC, id DESC LIMIT 1');
    const countRows = db.prepare('SELECT count(*) AS n FROM runs WHERE started_at >= ? AND connection_id IS NOT NULL');

    const get = id => getRow.get(id) ?? null;
    const expired = run => now() - Date.parse(run.started_at) > RUN_OPEN_MS;
    const countSince = since => countRows.get(since).n;

    // The run with this label, opened now if it's new. A run that has
    // reported, or started over RUN_OPEN_MS ago, is closed: each refusal
    // says what to do. Connectors open at most runsPerDay runs a day; the
    // owner's own aren't counted.
    function open(label, connectionId) {
        const run = byLabel.get(label);
        if (run?.ended_at) throw new HttpError(409, `The run "${label}" already reported at ${clock(run.ended_at)}. A new run needs a new label.`);
        if (run && expired(run)) throw new HttpError(409, `The run "${label}" started over 3 hours ago, so it's closed. A new run needs a new label.`);
        if (run) return run;
        const cap = runsPerDay();
        if (connectionId !== null && countSince(dayStart()) >= cap) {
            throw new HttpError(429, `Today's limit of ${cap} agent runs is used up. It resets at midnight, or the owner can raise it on /manage.`);
        }
        return get(insert.run(label, now().toISOString(), connectionId).lastInsertRowid);
    }

    return {
        get,

        // for a write that names a run (server/access.js); connectionId: null
        // for the owner's token
        open: db.transaction((label, connectionId = null) => open(label, connectionId)),

        // Closes the run, opening it first if it changed nothing. A second
        // report of the same run is refused, so a retry after a lost answer is
        // harmless and a briefing can't be rewritten.
        report: db.transaction(({ run: label, summary, briefing }, connectionId = null) => {
            const run = byLabel.get(label);
            if (run?.ended_at) throw new HttpError(409, `The run "${label}" already reported at ${clock(run.ended_at)}. There's nothing more to do.`);
            if (run && expired(run)) throw new HttpError(409, `The run "${label}" started over 3 hours ago, so it can't be reported any more.`);
            const { id } = run ?? open(label, connectionId);
            reportRow.run(now().toISOString(), summary, briefing, id);
            return get(id);
        }),

        // newest first; since: runs still going or ended at or after it
        list({ since, limit = 14 } = {}) {
            const where = since ? 'WHERE coalesce(ended_at, started_at) >= @since' : '';
            return db.prepare(`SELECT * FROM runs ${where} ORDER BY started_at DESC, id DESC LIMIT @limit`).all(since ? { since, limit } : { limit });
        },

        latest() {
            return latestRow.get() ?? null;
        },

        // runs opened through a connector since an ISO timestamp, for the daily cap
        countSince,
    };
}
