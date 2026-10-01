-- One-off dates such as finals or a break; birthdays come from Google Calendar (DESIGN §3).
CREATE TABLE countdowns (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 100),
    target_date TEXT NOT NULL CHECK (target_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- at most one countdown is pinned
CREATE UNIQUE INDEX countdowns_one_pinned ON countdowns (pinned) WHERE pinned = 1;
