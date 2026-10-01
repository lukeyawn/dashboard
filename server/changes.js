// The change record (DESIGN §5.5): every write, from anyone, with who made it
// and the row before and after, so anything can be reviewed and undone.
import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage();

// Runs fn with this actor, and the claude.ai connection if there is one,
// recorded on every change it makes. Outside any request (scripts, startup)
// changes are recorded as 'system'.
export function withActor(actor, fn, connectionId = null) {
    return context.run({ actor, connectionId }, fn);
}

export function currentActor() {
    return context.getStore()?.actor ?? 'system';
}

// Who a request is. The credential decides (docs/CONNECTOR.md §5): the kiosk's
// token is the kiosk, and a claude.ai connector's token is Claude whatever it
// sends. Only the owner's token may say it's Claude Code, and that label can't
// raise anyone's rights, since the owner's token can already do everything.
export function actorOf(req) {
    if (req.client === 'kiosk') return 'kiosk';
    if (req.client === 'connector') return req.connection.connector === 'agent' ? 'agent' : 'claude';
    return req.get('X-Dashboard-Client') === 'claude' ? 'claude' : 'owner';
}

// the claude.ai connection behind a request, recorded with its changes
export function connectionOf(req) {
    return req.client === 'connector' ? req.connection.id : null;
}

// Where a change by Claude came from: claude.ai (a connection) or Claude Code
// (the owner's token, from the stdio MCP server)
export function viaOf(change) {
    if (change.connection_id !== null && change.connection_id !== undefined) return 'claude.ai';
    return change.actor === 'claude' ? 'claude-code' : null;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const parse = text => (text === null ? null : JSON.parse(text));
const fromDb = row => row && { ...row, before: parse(row.before), after: parse(row.after), via: viaOf(row) };

export function createChangeLog(db, { now = Date.now } = {}) {
    const insert = db.prepare(`
        INSERT INTO changes (at, actor, resource, item_id, action, before, after, connection_id)
        VALUES (@at, @actor, @resource, @item_id, @action, @before, @after, @connection_id)`);
    const getStatement = db.prepare('SELECT * FROM changes WHERE id = ?');
    const pruneStatement = db.prepare('DELETE FROM changes WHERE at < ?');
    let lastPrune = 0;

    function select({ actor, resource, via, since }, limit) {
        const where = [];
        const params = {};
        const actors = actor === undefined ? [] : [actor].flat();
        if (actors.length) {
            where.push(`actor IN (${actors.map((_, i) => `@actor${i}`).join(', ')})`);
            actors.forEach((a, i) => { params[`actor${i}`] = a; });
        }
        if (resource) {
            where.push('resource = @resource');
            params.resource = resource;
        }
        if (via === 'claude.ai') where.push('connection_id IS NOT NULL');
        else if (via === 'claude-code') where.push("actor = 'claude' AND connection_id IS NULL");
        else if (via !== undefined) {
            where.push('connection_id = @via');
            params.via = via;
        }
        if (since) {
            where.push('at >= @since');
            params.since = since;
        }
        const sql = `SELECT * FROM changes${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC${limit ? ' LIMIT @limit' : ''}`;
        return db.prepare(sql).all(limit ? { ...params, limit } : params).map(fromDb);
    }

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
                connection_id: context.getStore()?.connectionId ?? null,
            });
        },

        get(id) {
            return fromDb(getStatement.get(id)) ?? null;
        },

        // newest first. actor: one actor or a list; via: 'claude.ai',
        // 'claude-code' or a connection id; since: an ISO timestamp
        list({ limit = 50, ...filters } = {}) {
            return select(filters, limit);
        },

        // every matching change, newest first, with no limit (for undo-since)
        matching(filters) {
            return select(filters, 0);
        },

        // how many changes claude.ai's connections of one connector made since
        // an ISO timestamp, for the daily write cap
        countSince(since, connector) {
            return db.prepare(`
                SELECT count(*) AS n FROM changes
                WHERE at >= ? AND connection_id IN (SELECT id FROM oauth_connections WHERE connector = ?)`).get(since, connector).n;
        },

        // The rows of a table that Claude created, keyed by "id|created_at" so
        // a reused id doesn't inherit the mark: { id, at, actor, via } of the
        // create change. Kept as long as the change record is (a year).
        claudeCreations(resource) {
            const rows = db.prepare(`
                SELECT id, item_id, at, actor, connection_id, json_extract(after, '$.created_at') AS created
                FROM changes WHERE resource = ? AND action = 'create' AND actor IN ('claude', 'agent')`).all(resource);
            return new Map(rows.map(r => [`${r.item_id}|${r.created}`, { id: r.id, at: r.at, actor: r.actor, via: viaOf(r) }]));
        },

        prune,
    };
}
