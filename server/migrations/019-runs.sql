-- The scheduled agent's runs (docs/AGENT.md §7). start_run makes a row with
-- the server's time; report_run fills in when it ended, a one-line summary
-- and the briefing. A run that never reports keeps ended_at empty, and the
-- status line says so. Kept for good, like the change record.
CREATE TABLE runs (
    id INTEGER PRIMARY KEY,
    name TEXT CHECK (name IS NULL OR length(trim(name)) BETWEEN 1 AND 40),
    started_at TEXT NOT NULL,
    ended_at TEXT CHECK (ended_at IS NULL OR ended_at >= started_at),
    summary TEXT CHECK (summary IS NULL OR length(trim(summary)) BETWEEN 1 AND 200),
    briefing TEXT CHECK (briefing IS NULL OR length(trim(briefing)) BETWEEN 1 AND 500),
    -- the claude.ai connection that started it; empty for the owner's token
    connection_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    -- a report sets all three at once
    CHECK ((ended_at IS NULL) = (summary IS NULL) AND (ended_at IS NULL) = (briefing IS NULL))
) STRICT;

CREATE INDEX runs_started ON runs (started_at);

-- Which run a change belongs to. Every write from the agent's connector names
-- an open run; everyone else's changes have none. It's a column of the
-- record itself, not of any item, so the copies of rows in before and after
-- are untouched (docs/UNDO.md §3).
ALTER TABLE changes ADD COLUMN run_id INTEGER REFERENCES runs (id);

CREATE INDEX changes_run ON changes (run_id);
