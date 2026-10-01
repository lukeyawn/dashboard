// Settings are key → JSON value rows (DESIGN §3). Users change night_start and
// night_end; the system keeps night_early_until and kiosk_location.

export const DEFAULTS = { night_start: '22:00', night_end: '06:30' };
const USER_KEYS = Object.keys(DEFAULTS);

export function createSettingsStore(db) {
    const getRow = db.prepare('SELECT value FROM settings WHERE key = ?');
    const setRow = db.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);
    const deleteRow = db.prepare('DELETE FROM settings WHERE key = ?');

    function get(key) {
        const row = getRow.get(key);
        return row ? JSON.parse(row.value) : (DEFAULTS[key] ?? null);
    }

    return {
        get,
        set(key, value) {
            setRow.run(key, JSON.stringify(value));
        },
        clear(key) {
            deleteRow.run(key);
        },
        // the settings a user can see and change
        user() {
            return Object.fromEntries(USER_KEYS.map(key => [key, get(key)]));
        },
        updateUser: db.transaction(changes => {
            for (const [key, value] of Object.entries(changes)) setRow.run(key, JSON.stringify(value));
            return Object.fromEntries(USER_KEYS.map(key => [key, get(key)]));
        }),
    };
}
