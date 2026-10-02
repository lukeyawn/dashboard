import { parseDate, startOfWeek, today as todayOf } from '../../shared/dates.js';
import { createStore } from '../crud.js';
import { HttpError } from '../errors.js';

// Goals (docs/BLOCKS.md §5): progress goals count toward a target, by step,
// and milestones are done once. Dreams are goals kept off the tile.
// weekStart: returns the week_start setting, for the progress made this week.
export function createGoalStore(db, { log, now = () => new Date(), weekStart = () => 'sunday' } = {}) {
    const store = createStore(db, {
        table: 'goals',
        columns: ['name', 'current', 'target', 'unit', 'archived_at', 'kind', 'deadline', 'started', 'step', 'achieved_at', 'dream'],
        // the nearest deadline first, goals without one last, then oldest first
        orderBy: 'deadline IS NULL, deadline, id',
        filters: {
            archived: { true: 'archived_at IS NOT NULL', false: 'archived_at IS NULL' },
            dream: { true: 'dream = 1', false: 'dream = 0' },
        },
        booleans: ['dream'],
        log,
    });

    // How much current went up since the week started: the sum of after −
    // before over the goal's recorded updates, so the + button, update_goal,
    // the editor and Undo all count. The copies' created_at must match, so a
    // reused id doesn't inherit a deleted goal's progress.
    const gainSince = db.prepare(`
        SELECT coalesce(sum(json_extract(after, '$.current') - json_extract(before, '$.current')), 0) AS gain
        FROM changes
        WHERE resource = 'goals' AND item_id = @id AND action = 'update' AND at >= @since
            AND json_extract(after, '$.created_at') = @created_at`);

    function withWeek(goal) {
        if (!goal || goal.kind !== 'progress') return goal && { ...goal, week_gain: null };
        const since = parseDate(startOfWeek(todayOf(now()), weekStart())).toISOString();
        const { gain } = gainSince.get({ id: String(goal.id), since, created_at: goal.created_at });
        // rounded, so 0.1 + 0.2 reads as 0.3
        return { ...goal, week_gain: Math.round(gain * 1e6) / 1e6 };
    }

    // a progress goal's achieved_at: set when it first reaches its target,
    // kept while it stays there, and cleared if it drops back below
    const achievedAt = (before, current, target) => (current >= target ? before.achieved_at ?? new Date(now()).toISOString() : null);

    const MILESTONE_FIELDS = ['current', 'target', 'unit', 'step'];

    return {
        ...store,
        list: filters => store.list(filters).map(withWeek),
        get: id => withWeek(store.get(id)),

        // the pace starts today, in the dashboard's time zone, unless told otherwise
        create: db.transaction(given => {
            const values = { ...given, started: given.started ?? todayOf(now()) };
            if (values.kind === 'milestone') {
                return withWeek(store.create({ ...values, current: null, target: null, unit: null, step: null }));
            }
            const current = values.current ?? 0;
            return withWeek(store.create({ ...values, achieved_at: current >= values.target ? new Date(now()).toISOString() : null }));
        }),

        update: db.transaction((id, changes) => {
            const before = store.raw(id);
            if (!before) return null;
            const deadline = changes.deadline === undefined ? before.deadline : changes.deadline;
            if (deadline && (changes.started ?? before.started) > deadline) throw new HttpError(400, 'The deadline is before the start.');
            if (before.kind === 'milestone') {
                const extra = MILESTONE_FIELDS.find(key => changes[key] !== undefined && changes[key] !== null);
                if (extra) throw new HttpError(400, `A milestone has no ${extra}.`);
                return withWeek(store.update(id, changes));
            }
            const current = changes.current ?? before.current;
            const target = changes.target ?? before.target;
            return withWeek(store.update(id, { ...changes, achieved_at: achievedAt(before, current, target) }));
        }),

        // adds progress, the goal's step by default; a negative amount undoes
        // a mistaken tap, never going below 0. null if there's no such goal.
        increment: db.transaction((id, by) => {
            const before = store.raw(id);
            if (!before) return null;
            if (before.kind === 'milestone') throw new HttpError(409, 'A milestone has no progress to add; mark it done instead.');
            const current = Math.max(0, before.current + (by ?? before.step));
            return withWeek(store.update(id, { current, achieved_at: achievedAt(before, current, before.target) }));
        }),

        // Done, for a milestone: achieved and archived, in one recorded change
        achieve: db.transaction(id => {
            const before = store.raw(id);
            if (!before) return null;
            if (before.kind !== 'milestone') throw new HttpError(409, 'Only a milestone is marked done; a progress goal is achieved when it reaches its target.');
            const at = new Date(now()).toISOString();
            return withWeek(store.update(id, { achieved_at: before.achieved_at ?? at, archived_at: before.archived_at ?? at }));
        }),
    };
}
