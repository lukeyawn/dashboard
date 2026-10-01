// Settings are key → JSON value rows (DESIGN §3). Users change night_start and
// night_end; the system keeps night_early_until and kiosk_location.

export const DEFAULTS = { night_start: '22:00', night_end: '06:30' };
const USER_KEYS = Object.keys(DEFAULTS);

// Kept out of the change record: the kiosk reports it daily, so it's noise
const UNRECORDED = new Set(['kiosk_location']);

export function createSettingsStore(db, { log } = {}) {
    const getRow = db.prepare('SELECT value FROM settings WHERE key = ?');
    const setRow = db.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);
    const deleteRow = db.prepare('DELETE FROM settings WHERE key = ?');

    function get(key) {
        const row = getRow.get(key);
        return row ? JSON.parse(row.value) : (DEFAULTS[key] ?? null);
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
            for (const [key, value] of Object.entries(changes)) set(key, value);
            return Object.fromEntries(USER_KEYS.map(key => [key, get(key)]));
        }),
    };
}
