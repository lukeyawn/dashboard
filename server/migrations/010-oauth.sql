-- claude.ai's connections (docs/CONNECTOR.md §4). Each approved sign-in is one
-- connection. Only hashes of tokens are stored, never the tokens themselves.
CREATE TABLE oauth_connections (
    id INTEGER PRIMARY KEY,
    connector TEXT NOT NULL CHECK (connector IN ('chat', 'agent')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_used_at TEXT,
    -- when and why it stopped working; null while it works
    ended_at TEXT,
    end_reason TEXT CHECK (end_reason IN ('revoked', 'switched_off', 'expired', 'reused')),
    -- the refresh token claude.ai holds now, and when it lapses unused
    refresh_hash TEXT NOT NULL UNIQUE,
    refresh_expires_at TEXT NOT NULL,
    -- the one it replaced, still accepted until previous_until or until the
    -- current one is used, in case the reply carrying it was lost
    previous_hash TEXT UNIQUE,
    previous_until TEXT
) STRICT;

-- refresh tokens that have been replaced for good; presenting one means a copy exists
CREATE TABLE oauth_retired_tokens (
    hash TEXT PRIMARY KEY,
    connection_id INTEGER NOT NULL REFERENCES oauth_connections (id) ON DELETE CASCADE
) STRICT;

CREATE TABLE oauth_access_tokens (
    hash TEXT PRIMARY KEY,
    connection_id INTEGER NOT NULL REFERENCES oauth_connections (id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
) STRICT;
