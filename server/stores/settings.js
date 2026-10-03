// Settings are key → JSON value rows (DESIGN §3). Users change night_start,
// night_end, week_start, assignments_area and agent_runs_per_day, and
// agent_seen_at changes when the owner looks at the agent's changes; the
// system keeps night_early_until and kiosk_location.
import { HttpError } from '../errors.js';

// assignments_area starts as School's id, stored by migration 015;
// agent_seen_at is null until the owner first looks (docs/AGENT.md §3);
// agent_runs_per_day caps the agent's runs, which the owner raises when
// adding agents (§7)
export const DEFAULTS = {
    night_start: '22:00', night_end: '06:30', week_start: 'sunday', assignments_area: null, agent_seen_at: null, agent_runs_per_day: 5,
};
const USER_KEYS = Object.keys(DEFAULTS);

// Kept out of the change record as noise: the kiosk reports its location
// daily, and agent_seen_at moves each time the owner looks
const UNRECORDED = new Set(['kiosk_location', 'agent_seen_at']);

export function createSettingsStore(db, { log } = {}) {
    const getRow = db.prepare('SELECT value FROM settings WHERE key = ?');
    const setRow = db.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);
    const deleteRow = db.prepare('DELETE FROM settings WHERE key = ?');
    const areaExists = db.prepare('SELECT 1 FROM areas WHERE id = ?');

    function get(key) {
        const row = getRow.get(key);
        if (key === 'assignments_area') return assignmentsArea(row);
        return row ? JSON.parse(row.value) : (DEFAULTS[key] ?? null);
    }

    // The Assignments tile's area, by id so renaming it changes nothing
    // (docs/BLOCKS.md §3). Once that area is deleted it reads as null, so the
    // tile asks for another; undoing the delete brings the same id back.
    function assignmentsArea(row) {
        const id = row ? JSON.parse(row.value) : null;
        return id !== null && areaExists.get(id) ? id : null;
    }

    // a setting's stored value, or null when it isn't set (defaults aren't stored)
    const stored = key => {
        const row = getRow.get(key);
        return row ? { value: JSON.parse(row.value) } : null;
    };

    const set = db.transaction((key, value) => {
        const before = stored(key);
        setRow.run(key, JSON.stringify(value));
        if (!UNRECORDED.has(key)) log?.record({ resource: 'settings', itemId: key, action: before ? 'update' : 'create', before, after: { value } });
    });

    const clear = db.transaction(key => {
        const before = stored(key);
        if (!before) return;
        deleteRow.run(key);
        if (!UNRECORDED.has(key)) log?.record({ resource: 'settings', itemId: key, action: 'delete', before, after: null });
    });

    return {
        get,
        set,
        clear,
        // the settings a user can see and change
        user() {
            return Object.fromEntries(USER_KEYS.map(key => [key, get(key)]));
        },
        updateUser: db.transaction(changes => {
            if (changes.assignments_area !== undefined && !areaExists.get(changes.assignments_area)) {
                throw new HttpError(400, `There's no area ${changes.assignments_area}.`);
            }
            for (const [key, value] of Object.entries(changes)) set(key, value);
            return Object.fromEntries(USER_KEYS.map(key => [key, get(key)]));
        }),
    };
}
