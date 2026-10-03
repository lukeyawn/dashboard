// The scheduled agent's runs and changes as one timeline, newest first, for
// the dock's popover (docs/AGENT.md §7). Changes belong to a run by its id,
// which the server recorded with each one, so overlapping runs never mix.
import { addDays, parseDate, today } from '../../shared/dates';

// the popover goes back over today and the two days before, and further for
// anything Luke hasn't seen yet
export const AGENT_HISTORY_DAYS = 3;

// The start of the history, as a UTC timestamp: local midnight, so it stays
// the same all day and the poll's address doesn't change every render
export function historyStart(now = new Date()) {
    return parseDate(addDays(today(now), -(AGENT_HISTORY_DAYS - 1))).toISOString();
}

// when an entry last had news: a run's report, else its newest change, else its start
const latest = (...times) => times.filter(Boolean).sort().at(-1) ?? null;

// runs: newest first, from GET /api/runs; changes: the agent's, newest first;
// seenAt: agent_seen_at, or null if Luke has never looked; from: where the
// history starts (historyStart), before which only new entries are kept.
// Returns { entries, newCount, seenUpTo }:
// - entries: { key, run (null for changes in no run), changes, at, isNew },
//   newest first
// - newCount: new changes, plus 1 for each new run that changed nothing new,
//   such as a report with no changes
// - seenUpTo: what agent_seen_at becomes once Luke has looked at all of it
export function buildTimeline(runs, changes, seenAt, from = null) {
    const isNew = at => !seenAt || at > seenAt;
    const byRun = new Map(runs.map(run => [run.id, { run, changes: [] }]));
    const loose = { fresh: [], seen: [] };
    for (const change of changes) {
        if (change.run_id === null || change.run_id === undefined) {
            loose[isNew(change.at) ? 'fresh' : 'seen'].push(change);
            continue;
        }
        // a run that started before the history did: its changes still show under it
        if (!byRun.has(change.run_id)) byRun.set(change.run_id, { run: { id: change.run_id, name: null, started_at: change.at, ended_at: null }, changes: [] });
        const group = byRun.get(change.run_id);
        group.changes.push(change);
        if (change.at < group.run.started_at) group.run = { ...group.run, started_at: change.at };
    }

    const entries = [...byRun.values()].map(({ run, changes: list }) => {
        const at = latest(run.ended_at, list[0]?.at, run.started_at);
        return { key: `run-${run.id}`, run, changes: list, at, isNew: isNew(at) };
    });
    for (const [kind, list] of Object.entries(loose)) {
        if (list.length) entries.push({ key: `loose-${kind}`, run: null, changes: list, at: list[0].at, isNew: kind === 'fresh' });
    }
    entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const shown = from ? entries.filter(e => e.isNew || e.at >= from) : entries;

    const newChanges = changes.filter(c => isNew(c.at)).length;
    const quietRuns = shown.filter(e => e.run && e.isNew && !e.changes.some(c => isNew(c.at))).length;
    return {
        entries: shown,
        newCount: newChanges + quietRuns,
        seenUpTo: latest(...shown.map(e => e.at)),
    };
}
