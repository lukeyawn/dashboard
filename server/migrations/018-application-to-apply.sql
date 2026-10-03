-- Job search gets a to-apply list (docs/BLOCKS.md §6): roles saved to apply
-- to, by the owner or found by Claude. SQLite can't change a CHECK or NOT
-- NULL in place, so applications is rebuilt again, its columns in the same
-- order:
--   status: adds to_apply
--   applied_on: empty only while it's to_apply
--   next_on: for one to apply to, the day to apply by
-- No column is added, renamed or dropped, and every stored value is still
-- allowed, so the change record's copies already match (docs/BLOCKS.md §10).
CREATE TABLE applications_new (
    id INTEGER PRIMARY KEY,
    company TEXT NOT NULL CHECK (length(trim(company)) BETWEEN 1 AND 100),
    role TEXT NOT NULL CHECK (length(trim(role)) BETWEEN 1 AND 100),
    status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('to_apply', 'applied', 'oa', 'interview', 'offer', 'rejected', 'withdrawn')),
    applied_on TEXT CHECK (applied_on IS NULL OR applied_on GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    url TEXT CHECK (url IS NULL OR length(url) <= 500),
    notes TEXT CHECK (notes IS NULL OR length(notes) <= 5000),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    source TEXT CHECK (source IS NULL OR length(source) BETWEEN 1 AND 200),
    next_on TEXT CHECK (next_on IS NULL OR next_on GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    next_time TEXT CHECK (next_time IS NULL OR (next_on IS NOT NULL AND next_time GLOB '[0-2][0-9]:[0-5][0-9]')),
    CHECK (applied_on IS NOT NULL OR status = 'to_apply')
) STRICT;

INSERT INTO applications_new SELECT * FROM applications;

DROP TABLE applications;
ALTER TABLE applications_new RENAME TO applications;
CREATE UNIQUE INDEX applications_source ON applications (source) WHERE source IS NOT NULL;
