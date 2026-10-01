// claude.ai's connections and their tokens (docs/CONNECTOR.md §4). Each
// approved sign-in is a connection; tokens are stored only as SHA-256 hashes.
//
// Refresh tokens are replaced on every use. A replacement isn't random: it's
// an HMAC of the token it replaces, under OAUTH_REFRESH_KEY, so the previous
// token always yields the same replacement. That lets a refresh whose reply
// was lost, or two refreshes at once, get the same token back instead of
// disconnecting claude.ai. Once the replacement has been used, the old token
// is retired, and presenting a retired token means a copy exists: the whole
// connection is revoked.
import crypto from 'node:crypto';

export const CONNECTORS = ['chat', 'agent'];
export const ACCESS_TTL_MS = 60 * 60 * 1000;
export const REFRESH_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
export const GRACE_MS = 10 * 60 * 1000;

// why a connection stopped, in words for /manage
export const END_REASONS = {
    revoked: 'You revoked it',
    switched_off: 'You switched the connector off',
    expired: 'Unused for 30 days',
    reused: 'An old sign-in token was used again, so it may have been copied',
};

// a refresh that can't go ahead; the token endpoint answers invalid_grant
export class RefreshError extends Error {}

const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');

export function createConnectionStore(db, { refreshKey, now = Date.now }) {
    if (!refreshKey) throw new Error('OAUTH_REFRESH_KEY must be set');
    const derive = token => crypto.createHmac('sha256', refreshKey).update(token).digest('base64url');
    const iso = (offset = 0) => new Date(now() + offset).toISOString();

    const insertConnection = db.prepare(`
        INSERT INTO oauth_connections (connector, created_at, last_used_at, refresh_hash, refresh_expires_at)
        VALUES (@connector, @at, @at, @refresh_hash, @refresh_expires_at) RETURNING *`);
    const insertAccess = db.prepare('INSERT INTO oauth_access_tokens (hash, connection_id, expires_at) VALUES (?, ?, ?)');
    const pruneAccess = db.prepare('DELETE FROM oauth_access_tokens WHERE expires_at <= ?');
    const findAccess = db.prepare(`
        SELECT c.id, c.connector FROM oauth_access_tokens a JOIN oauth_connections c ON c.id = a.connection_id
        WHERE a.hash = ? AND a.expires_at > ? AND c.ended_at IS NULL`);
    const touch = db.prepare('UPDATE oauth_connections SET last_used_at = ? WHERE id = ?');
    const byCurrent = db.prepare('SELECT * FROM oauth_connections WHERE refresh_hash = ?');
    const byPrevious = db.prepare('SELECT * FROM oauth_connections WHERE previous_hash = ?');
    const byRetired = db.prepare('SELECT connection_id FROM oauth_retired_tokens WHERE hash = ?');
    const retire = db.prepare('INSERT OR IGNORE INTO oauth_retired_tokens (hash, connection_id) VALUES (?, ?)');
    const rotate = db.prepare(`
        UPDATE oauth_connections SET previous_hash = @previous_hash, previous_until = @previous_until,
            refresh_hash = @refresh_hash, refresh_expires_at = @refresh_expires_at, last_used_at = @at
        WHERE id = @id`);
    const endStatement = db.prepare('UPDATE oauth_connections SET ended_at = ?, end_reason = ? WHERE id = ? AND ended_at IS NULL');
    const dropAccess = db.prepare('DELETE FROM oauth_access_tokens WHERE connection_id = ?');
    const liveOf = db.prepare('SELECT id FROM oauth_connections WHERE connector = ? AND ended_at IS NULL');
    const stale = db.prepare('SELECT id FROM oauth_connections WHERE ended_at IS NULL AND refresh_expires_at <= ?');

    function issueAccess(connectionId) {
        pruneAccess.run(iso());
        const token = random();
        insertAccess.run(hash(token), connectionId, iso(ACCESS_TTL_MS));
        return token;
    }

    const tokens = (connectionId, refreshToken) => ({
        accessToken: issueAccess(connectionId),
        refreshToken,
        expiresIn: ACCESS_TTL_MS / 1000,
    });

    // true if it was live and has now ended
    const end = db.transaction((id, reason) => {
        const ended = endStatement.run(iso(), reason, id).changes > 0;
        dropAccess.run(id);
        return ended;
    });

    // connections whose refresh token lapsed unused end as expired
    function expireStale() {
        for (const { id } of stale.all(iso())) end(id, 'expired');
    }


    // { tokens } to go ahead; otherwise { end: [id, reason] } when the attempt
    // shows a connection should end, or {} for a token that isn't valid
    const attemptRefresh = db.transaction((refreshToken, connector) => {
        if (typeof refreshToken !== 'string' || !refreshToken) return {};
        const presented = hash(refreshToken);

        const current = byCurrent.get(presented);
        if (current) {
            if (current.ended_at || current.connector !== connector) return {};
            if (current.refresh_expires_at <= iso()) return { end: [current.id, 'expired'] };
            const next = derive(refreshToken);
            if (current.previous_hash) retire.run(current.previous_hash, current.id);
            rotate.run({
                id: current.id,
                previous_hash: presented,
                previous_until: iso(GRACE_MS),
                refresh_hash: hash(next),
                refresh_expires_at: iso(REFRESH_IDLE_MS),
                at: iso(),
            });
            return { tokens: tokens(current.id, next) };
        }

        // the token before the current one: its reply may have been lost
        const previous = byPrevious.get(presented);
        if (previous) {
            if (previous.ended_at || previous.connector !== connector) return {};
            if (previous.previous_until > iso()) return { tokens: tokens(previous.id, derive(refreshToken)) };
            return { end: [previous.id, 'reused'] };
        }

        const retired = byRetired.get(presented);
        return retired ? { end: [retired.connection_id, 'reused'] } : {};
    });

    return {
        // a new connection, after the owner approved it
        create: db.transaction(connector => {
            if (!CONNECTORS.includes(connector)) throw new Error(`Unknown connector ${connector}`);
            const refreshToken = random();
            const connection = insertConnection.get({ connector, at: iso(), refresh_hash: hash(refreshToken), refresh_expires_at: iso(REFRESH_IDLE_MS) });
            return { connection, ...tokens(connection.id, refreshToken) };
        }),

        // { id, connector } for a live access token, or null
        verifyAccess(token) {
            if (typeof token !== 'string' || !token) return null;
            const found = findAccess.get(hash(token), iso());
            if (!found) return null;
            touch.run(iso(), found.id);
            return found;
        },

        // new tokens for a refresh token, or a RefreshError
        refresh(refreshToken, connector) {
            const outcome = attemptRefresh(refreshToken, connector);
            // ending a connection outlives the failed refresh that found the reason
            if (outcome.end) end(...outcome.end);
            if (!outcome.tokens) throw new RefreshError('That sign-in is no longer valid. Connect again in claude.ai.');
            return outcome.tokens;
        },

        revoke: id => end(id, 'revoked'),

        // every live connection of a connector, as when it's switched off
        revokeAll: db.transaction((connector, reason = 'switched_off') => {
            for (const { id } of liveOf.all(connector)) end(id, reason);
        }),

        // the most recent connections, newest first, for /manage
        list() {
            expireStale();
            return db.prepare(`
                SELECT id, connector, created_at, last_used_at, ended_at, end_reason
                FROM oauth_connections ORDER BY id DESC LIMIT 20`).all();
        },

        // the connector's latest connection, if it ended without the owner
        // ending it (expired, or revoked as copied); the status line says so
        // until a new connection is approved
        lost(connector) {
            expireStale();
            const latest = db.prepare('SELECT * FROM oauth_connections WHERE connector = ? ORDER BY id DESC LIMIT 1').get(connector);
            return latest && ['expired', 'reused'].includes(latest.end_reason) ? latest : null;
        },
    };
}
