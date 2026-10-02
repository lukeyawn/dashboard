import { today } from '../../shared/dates.js';
import { countdownProblems, isCurrent } from '../../shared/countdowns.js';
import { createStore } from '../crud.js';
import { HttpError } from '../errors.js';

// At most one countdown is pinned: pinning one unpins the rest (DESIGN §10, Countdown).
// A date (and time) that has passed is refused, on a new countdown or as a
// new date for one, and a countdown is past from the day after its target,
// worked out on every read (docs/BLOCKS.md §4).
export function createCountdownStore(db, { log, now = () => new Date() } = {}) {
    const store = createStore(db, {
        table: 'countdowns',
        columns: ['label', 'target_date', 'target_time', 'detail', 'pinned', 'source'],
        // nearest first; one without a time counts to the start of its day (SQLite puts NULL first)
        orderBy: 'target_date, target_time, id',
        booleans: ['pinned'],
        log,
        sourced: true,
    });
    const pinnedOthers = db.prepare('SELECT id FROM countdowns WHERE pinned = 1 AND id IS NOT ?');
    // through the store, so each unpinning is in the change record too
    const unpinOthers = id => pinnedOthers.all(id).forEach(row => store.update(row.id, { pinned: false }));

    // the same text the editor shows beside the field, so Claude reads it too
    function refuseProblems(values, before) {
        const problems = countdownProblems(values, now(), before);
        if (problems) throw new HttpError(400, Object.values(problems).join(' '));
    }

    return {
        ...store,
        // past: false (the default) for the current countdowns, true for the past ones
        list({ past = false } = {}) {
            const todayDate = today(now());
            return store.list().filter(c => isCurrent(c, todayDate) !== past);
        },
        create: db.transaction(values => {
            refuseProblems(values, null);
            if (values.pinned) unpinOthers(null);
            return store.create(values);
        }),
        update: db.transaction((id, changes) => {
            const before = store.get(id);
            if (!before) return null;
            refuseProblems(changes, before);
            if (changes.pinned) unpinOthers(id);
            return store.update(id, changes);
        }),
    };
}
