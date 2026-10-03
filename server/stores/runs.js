// The scheduled agent's runs (docs/AGENT.md §7). A run starts with
// start_run and ends with report_run, both on the server's clock, so the
// agent never says what time it is. Every write from the agent's connector
// names an open run, and the change record keeps which one, so a run's
// changes can be listed and undone together even when two runs overlap.
import { RUN_OPEN_MS } from '../../shared/runs.js';
import { HttpError } from '../errors.js';

export { RUN_OPEN_MS };

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

// "7:09 AM", in the dashboard's time zone, for the agent to read
const clock = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function createRunStore(db, { now = () => new Date() } = {}) {
    const insert = db.prepare('INSERT INTO runs (name, started_at, connection_id) VALUES (?, ?, ?)');
    const getRow = db.prepare('SELECT * FROM runs WHERE id = ?');
    const reportRow = db.prepare(`UPDATE runs SET ended_at = ?, summary = ?, briefing = ?, updated_at = ${NOW} WHERE id = ?`);
    const latestRow = db.prepare('SELECT * FROM runs ORDER BY started_at DESC, id DESC LIMIT 1');
    const countRows = db.prepare('SELECT count(*) AS n FROM runs WHERE started_at >= ? AND connection_id IS NOT NULL');

    const get = id => getRow.get(id) ?? null;
    const expired = run => now() - Date.parse(run.started_at) > RUN_OPEN_MS;

    return {
        get,

        // name: optional, such as "Email"; connectionId: null for the owner's token
        start({ name = null, connectionId = null } = {}) {
            const { lastInsertRowid } = insert.run(name, now().toISOString(), connectionId);
            return get(lastInsertRowid);
        },

        // Throws unless writes may name this run: it exists, hasn't reported,
        // and started under RUN_OPEN_MS ago. Each refusal says what to do.
        checkOpen(id) {
            const run = id === null ? null : get(id);
            if (!run) {
                const what = id === null ? 'This write names no run' : `There's no run ${id}`;
                throw new HttpError(400, `${what}. Call start_run first, and pass its id as run on every change.`);
            }
            if (run.ended_at) throw new HttpError(409, `Run ${id} already reported at ${clock(run.ended_at)}. Call start_run for a new run.`);
            if (expired(run)) throw new HttpError(409, `Run ${id} started over 3 hours ago, so it's closed. Call start_run for a new run.`);
            return run;
        },

        // A second report of the same run is refused, so a retry after a lost
        // answer is harmless and a briefing can't be rewritten
        report: db.transaction((id, { summary, briefing }) => {
            const run = get(id);
            if (!run) throw new HttpError(404, `There's no run ${id}`);
            if (run.ended_at) throw new HttpError(409, `Run ${id} already reported at ${clock(run.ended_at)}. There's nothing more to do.`);
            if (expired(run)) throw new HttpError(409, `Run ${id} started over 3 hours ago, so it can't be reported any more.`);
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

        // runs started through a connector since an ISO timestamp, for the daily cap
        countSince(since) {
            return countRows.get(since).n;
        },
    };
}
