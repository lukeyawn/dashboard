import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db.js';
import { ACCESS_TTL_MS, GRACE_MS, REFRESH_IDLE_MS, RefreshError, createConnectionStore } from './connections.js';

let db;
let time;
let store;

beforeEach(() => {
    db = openDatabase(':memory:');
    time = Date.parse('2026-10-01T12:00:00Z');
    store = createConnectionStore(db, { refreshKey: 'test-refresh-key', now: () => time });
});

const refreshFails = (token, connector = 'chat') => expect(() => store.refresh(token, connector)).toThrow(RefreshError);

describe('connections', () => {
    it('needs a refresh key', () => {
        expect(() => createConnectionStore(db, {})).toThrow(/OAUTH_REFRESH_KEY/);
    });

    it('issues tokens for a new connection and stores only their hashes', () => {
        const { connection, accessToken, refreshToken, expiresIn } = store.create('chat');
        expect(connection.connector).toBe('chat');
        expect(expiresIn).toBe(3600);
        const stored = JSON.stringify(db.prepare('SELECT * FROM oauth_connections').all()) + JSON.stringify(db.prepare('SELECT * FROM oauth_access_tokens').all());
        expect(stored).not.toContain(accessToken);
        expect(stored).not.toContain(refreshToken);
        expect(() => store.create('nobody')).toThrow();
    });

    it('verifies an access token until it expires, and notes when it was used', () => {
        const { connection, accessToken } = store.create('chat');
        time += 60_000;
        expect(store.verifyAccess(accessToken)).toEqual({ id: connection.id, connector: 'chat' });
        expect(store.list()[0].last_used_at).toBe(new Date(time).toISOString());
        time += ACCESS_TTL_MS;
        expect(store.verifyAccess(accessToken)).toBeNull();
        expect(store.verifyAccess('made-up')).toBeNull();
        expect(store.verifyAccess('')).toBeNull();
        expect(store.verifyAccess(undefined)).toBeNull();
    });

    it('rotates the refresh token on every use', () => {
        const first = store.create('chat');
        const second = store.refresh(first.refreshToken, 'chat');
        expect(second.refreshToken).not.toBe(first.refreshToken);
        expect(store.verifyAccess(second.accessToken)).not.toBeNull();
        const third = store.refresh(second.refreshToken, 'chat');
        expect(third.refreshToken).not.toBe(second.refreshToken);
    });

    it('gives the same replacement to a repeat within the grace window, so a lost reply costs nothing', () => {
        const first = store.create('chat');
        // two refreshes at once, or a reply that never arrived
        const a = store.refresh(first.refreshToken, 'chat');
        const b = store.refresh(first.refreshToken, 'chat');
        expect(b.refreshToken).toBe(a.refreshToken);
        expect(b.accessToken).not.toBe(a.accessToken);
        // whichever reply claude.ai kept, the next day's refresh works
        time += 24 * 60 * 60 * 1000;
        expect(store.refresh(a.refreshToken, 'chat').refreshToken).toBeTruthy();
    });

    it('revokes the connection when a replaced token is used after its replacement', () => {
        const first = store.create('chat');
        const second = store.refresh(first.refreshToken, 'chat');
        store.refresh(second.refreshToken, 'chat');
        // first is retired now: someone holds a copy
        refreshFails(first.refreshToken);
        expect(store.list()[0]).toMatchObject({ end_reason: 'reused' });
        expect(store.verifyAccess(second.accessToken)).toBeNull();
        expect(store.lost('chat')).toMatchObject({ end_reason: 'reused' });
    });

    it('revokes the connection when the previous token is used after the grace window', () => {
        const first = store.create('chat');
        store.refresh(first.refreshToken, 'chat');
        time += GRACE_MS;
        refreshFails(first.refreshToken);
        expect(store.list()[0].end_reason).toBe('reused');
    });

    it('expires a connection unused for 30 days', () => {
        const first = store.create('chat');
        time += REFRESH_IDLE_MS;
        refreshFails(first.refreshToken);
        expect(store.list()[0].end_reason).toBe('expired');
        expect(store.lost('chat')).toMatchObject({ end_reason: 'expired' });
    });

    it('marks lapsed connections expired even if claude.ai never tries again', () => {
        store.create('chat');
        time += REFRESH_IDLE_MS + 1;
        expect(store.lost('chat')).toMatchObject({ end_reason: 'expired' });
        // a new approval clears it
        store.create('chat');
        expect(store.lost('chat')).toBeNull();
    });

    it("refuses a token from the other connector's client, an unknown token, or an empty one", () => {
        const { refreshToken } = store.create('chat');
        refreshFails(refreshToken, 'agent');
        refreshFails('made-up');
        refreshFails('');
        refreshFails(null);
        // still works for its own client
        expect(store.refresh(refreshToken, 'chat').refreshToken).toBeTruthy();
    });

    it('refuses the previous token from the wrong client too', () => {
        const first = store.create('chat');
        store.refresh(first.refreshToken, 'chat');
        refreshFails(first.refreshToken, 'agent');
    });

    it('revokes one connection, or all of a connector, ending their tokens', () => {
        const a = store.create('chat');
        const b = store.create('chat');
        const c = store.create('agent');
        expect(store.revoke(a.connection.id)).toBe(true);
        expect(store.revoke(a.connection.id)).toBe(false);
        expect(store.verifyAccess(a.accessToken)).toBeNull();
        refreshFails(a.refreshToken);
        store.revokeAll('chat');
        expect(store.verifyAccess(b.accessToken)).toBeNull();
        expect(store.verifyAccess(c.accessToken)).not.toBeNull();
        const reasons = Object.fromEntries(store.list().map(r => [r.id, r.end_reason]));
        expect(reasons).toEqual({ [a.connection.id]: 'revoked', [b.connection.id]: 'switched_off', [c.connection.id]: null });
        // the owner ending them isn't a lost connection
        expect(store.lost('chat')).toBeNull();
        expect(store.lost('agent')).toBeNull();
    });

    it('refuses to refresh an ended connection', () => {
        const first = store.create('chat');
        const second = store.refresh(first.refreshToken, 'chat');
        store.revoke(first.connection.id);
        refreshFails(second.refreshToken);
        refreshFails(first.refreshToken);
    });
});
