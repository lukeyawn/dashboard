-- Job search gets an OA stage, withdrawn, and the next step's date (docs/BLOCKS.md §6).
-- SQLite can't change a CHECK in place, so applications is rebuilt. Its
-- columns keep their old order, source included, with the new ones last:
--   status: adds oa (an online assessment) and withdrawn (dropped by the
--     owner); rejected and withdrawn are archived, off the tile
--   next_on: the next step's date: the OA's due date, the interview's day,
--     or the day an offer needs a reply by
--   next_time: the next step's time, optional, only with a date
CREATE TABLE applications_new (
    id INTEGER PRIMARY KEY,
    company TEXT NOT NULL CHECK (length(trim(company)) BETWEEN 1 AND 100),
    role TEXT NOT NULL CHECK (length(trim(role)) BETWEEN 1 AND 100),
    status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'oa', 'interview', 'offer', 'rejected', 'withdrawn')),
    applied_on TEXT NOT NULL CHECK (applied_on GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    url TEXT CHECK (url IS NULL OR length(url) <= 500),
    notes TEXT CHECK (notes IS NULL OR length(notes) <= 5000),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    source TEXT CHECK (source IS NULL OR length(source) BETWEEN 1 AND 200),
    next_on TEXT CHECK (next_on IS NULL OR next_on GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    next_time TEXT CHECK (next_time IS NULL OR (next_on IS NOT NULL AND next_time GLOB '[0-2][0-9]:[0-5][0-9]'))
) STRICT;

INSERT INTO applications_new (id, company, role, status, applied_on, url, notes, created_at, updated_at, source)
SELECT id, company, role, status, applied_on, url, notes, created_at, updated_at, source
FROM applications;

DROP TABLE applications;
ALTER TABLE applications_new RENAME TO applications;
CREATE UNIQUE INDEX applications_source ON applications (source) WHERE source IS NOT NULL;

-- The change record's copies of applications get the new columns too, last
-- and in this order, so Undo still matches them, key order included
-- (docs/BLOCKS.md §10). Every status they hold is still allowed.
UPDATE changes SET
    before = CASE WHEN before IS NULL THEN NULL ELSE json_set(before, '$.next_on', json('null'), '$.next_time', json('null')) END,
    after = CASE WHEN after IS NULL THEN NULL ELSE json_set(after, '$.next_on', json('null'), '$.next_time', json('null')) END
WHERE resource = 'applications';
