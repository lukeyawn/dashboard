// The change record (DESIGN §5.5): every write, from anyone, with who made it
// and the row before and after, so anything can be reviewed and undone.
import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage();

// Runs fn with this actor recorded on every change it makes. Outside any
// request (scripts, startup) changes are recorded as 'system'.
export function withActor(actor, fn) {
    return context.run({ actor }, fn);
}

export function currentActor() {
    return context.getStore()?.actor ?? 'system';
}

// Who a request is: the kiosk's token is the kiosk; the owner's token is the
// owner, or Claude when the MCP server says so. The label can't raise anyone's
// rights, since it only renames a credential that can already do everything.
export function actorOf(req) {
    if (req.client === 'kiosk') return 'kiosk';
    return req.get('X-Dashboard-Client') === 'claude' ? 'claude' : 'owner';
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const parse = text => (text === null ? null : JSON.parse(text));
const fromDb = row => row && { ...row, before: parse(row.before), after: parse(row.after) };

export function createChangeLog(db, { now = Date.now } = {}) {
    const insert = db.prepare(`
        INSERT INTO changes (at, actor, resource, item_id, action, before, after)
        VALUES (@at, @actor, @resource, @item_id, @action, @before, @after)`);
    const getStatement = db.prepare('SELECT * FROM changes WHERE id = ?');
    const pruneStatement = db.prepare('DELETE FROM changes WHERE at < ?');
    let lastPrune = 0;

    function prune() {
        lastPrune = now();
        pruneStatement.run(new Date(now() - YEAR_MS).toISOString());
    }

    return {
        // before and after are whole rows (or null), stored as JSON
        record({ resource, itemId, action, before = null, after = null }) {
            if (now() - lastPrune > DAY_MS) prune();
            insert.run({
                at: new Date(now()).toISOString(),
                actor: currentActor(),
                resource,
                item_id: String(itemId),
                action,
                before: before === null ? null : JSON.stringify(before),
                after: after === null ? null : JSON.stringify(after),
            });
        },

        get(id) {
            return fromDb(getStatement.get(id)) ?? null;
        },

        // newest first
        list({ limit = 50, actor, resource } = {}) {
            const where = [];
            const params = { limit };
            if (actor) {
                where.push('actor = @actor');
                params.actor = actor;
            }
            if (resource) {
                where.push('resource = @resource');
                params.resource = resource;
            }
            const sql = `SELECT * FROM changes${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT @limit`;
            return db.prepare(sql).all(params).map(fromDb);
        },

        prune,
    };
}
