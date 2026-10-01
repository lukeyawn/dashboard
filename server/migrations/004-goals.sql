-- No time frames in v1 (DESIGN §3).
CREATE TABLE goals (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    current REAL NOT NULL DEFAULT 0 CHECK (current >= 0),
    target REAL NOT NULL CHECK (target > 0),
    unit TEXT CHECK (unit IS NULL OR length(unit) BETWEEN 1 AND 20),
    archived_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
