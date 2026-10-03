import { describe, expect, it } from 'vitest';
import { buildTimeline, historyStart } from './timeline';

const at = minute => `2026-10-03T12:${String(minute).padStart(2, '0')}:00.000Z`;
const change = (id, minute, runId = null) => ({ id, at: at(minute), run_id: runId, actor: 'agent' });
const run = (id, started, ended, extra = {}) => ({ id, name: null, started_at: at(started), ended_at: ended === null ? null : at(ended), summary: null, briefing: null, ...extra });

describe('buildTimeline', () => {
    it('groups changes by their run, even when two runs overlap, newest first', () => {
        const runs = [run(2, 3, 9), run(1, 0, 6)];
        const changes = [change(14, 8, 2), change(13, 5, 1), change(12, 4, 2), change(11, 1, 1)];
        const { entries } = buildTimeline(runs, changes, null);
        expect(entries.map(e => [e.key, e.changes.map(c => c.id)])).toEqual([['run-2', [14, 12]], ['run-1', [13, 11]]]);
        expect(entries[0].at).toBe(at(9));
    });

    it('puts changes in no run in their own entries, new apart from seen', () => {
        const { entries } = buildTimeline([run(1, 10, 12)], [change(5, 11, 1), change(4, 8), change(3, 2)], at(5));
        expect(entries.map(e => [e.key, e.run, e.isNew, e.changes.map(c => c.id)])).toEqual([
            ['run-1', entries[0].run, true, [5]],
            ['loose-fresh', null, true, [4]],
            ['loose-seen', null, false, [3]],
        ]);
    });

    it('marks what came after agent_seen_at as new, so the line falls between them', () => {
        const runs = [run(3, 20, 25), run(2, 10, 15), run(1, 0, 5)];
        const { entries, newCount } = buildTimeline(runs, [change(9, 21, 3), change(8, 22, 3), change(7, 11, 2)], at(15));
        expect(entries.map(e => e.isNew)).toEqual([true, false, false]);
        expect(newCount).toBe(2);
    });

    it('counts a new report with no changes, and covers it in what becomes seen', () => {
        const { newCount, seenUpTo } = buildTimeline([run(2, 20, 30), run(1, 0, 5)], [change(1, 2, 1)], at(5));
        expect(newCount).toBe(1);
        expect(seenUpTo).toBe(at(30));
        // once seen up to there, nothing is new
        expect(buildTimeline([run(2, 20, 30), run(1, 0, 5)], [change(1, 2, 1)], seenUpTo).newCount).toBe(0);
    });

    it('counts a run still going by its newest change, and a run that changed nothing by its start', () => {
        const { entries, seenUpTo } = buildTimeline([run(2, 40, null), run(1, 30, null)], [change(1, 45, 2)], null);
        expect(entries.map(e => [e.key, e.at])).toEqual([['run-2', at(45)], ['run-1', at(30)]]);
        expect(seenUpTo).toBe(at(45));
    });

    it('treats everything as new when Luke has never looked', () => {
        const { entries, newCount } = buildTimeline([run(1, 0, 5)], [change(1, 2, 1), change(2, 3)], null);
        expect(entries.every(e => e.isNew)).toBe(true);
        expect(newCount).toBe(2);
    });

    it('keeps the changes of a run that started before the history, under that run', () => {
        const { entries } = buildTimeline([], [change(2, 7, 9), change(1, 6, 9)], null);
        expect(entries).toHaveLength(1);
        expect(entries[0].run).toMatchObject({ id: 9, started_at: at(6), ended_at: null });
    });

    it('keeps seen entries from before the history starts out, but never new ones', () => {
        const runs = [run(2, 30, 35), run(1, 0, 5)];
        const { entries, seenUpTo } = buildTimeline(runs, [change(1, 2, 1)], at(5), at(20));
        expect(entries.map(e => e.key)).toEqual(['run-2']);
        expect(seenUpTo).toBe(at(35));
        expect(buildTimeline(runs, [change(1, 2, 1)], at(1), at(20)).entries.map(e => e.key)).toEqual(['run-2', 'run-1']);
        // a quiet few days: nothing at all
        expect(buildTimeline([run(1, 0, 5)], [], at(5), at(20)).entries).toEqual([]);
    });

    it('has nothing for no runs and no changes', () => {
        expect(buildTimeline([], [], null)).toEqual({ entries: [], newCount: 0, seenUpTo: null });
    });
});

describe('historyStart', () => {
    it('is local midnight two days before today, all day long', () => {
        expect(historyStart(new Date(2026, 9, 3, 0, 1))).toBe(new Date(2026, 9, 1).toISOString());
        expect(historyStart(new Date(2026, 9, 3, 23, 59))).toBe(new Date(2026, 9, 1).toISOString());
    });
});
