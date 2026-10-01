-- Daily only in v1. A row in habit_checks means the habit was done that day (DESIGN §3).
CREATE TABLE habits (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    position INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE habit_checks (
    habit_id INTEGER NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
    date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    PRIMARY KEY (habit_id, date)
) STRICT, WITHOUT ROWID;
