-- Goals get deadlines with pace, a step, milestones and dreams (docs/BLOCKS.md §5).
-- SQLite can't make target nullable in place, so goals is rebuilt. Its
-- columns keep their old order, with the new ones last:
--   kind: progress (a count toward a target) or milestone (done once); a
--     milestone has no current, target, unit or step
--   deadline: optional; with one, the tile shows the pace
--   started: where the pace starts, the day the goal was created by default
--   step: how much + adds
--   achieved_at: when a progress goal reached its target, or a milestone was done
--   dream: a long-horizon goal, kept off the tile
CREATE TABLE goals_new (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    current REAL DEFAULT 0 CHECK (current IS NULL OR current >= 0),
    target REAL CHECK (target IS NULL OR target > 0),
    unit TEXT CHECK (unit IS NULL OR length(unit) BETWEEN 1 AND 20),
    archived_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    kind TEXT NOT NULL DEFAULT 'progress' CHECK (kind IN ('progress', 'milestone')),
    deadline TEXT CHECK (deadline IS NULL OR deadline GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    started TEXT NOT NULL CHECK (started GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    step REAL DEFAULT 1 CHECK (step IS NULL OR step > 0),
    achieved_at TEXT,
    dream INTEGER NOT NULL DEFAULT 0 CHECK (dream IN (0, 1)),
    CHECK (CASE kind
        WHEN 'progress' THEN current IS NOT NULL AND target IS NOT NULL AND step IS NOT NULL
        ELSE current IS NULL AND target IS NULL AND unit IS NULL AND step IS NULL END)
) STRICT;

-- every goal so far counts progress, and started on the local day it was created
INSERT INTO goals_new (id, name, current, target, unit, archived_at, created_at, updated_at, started)
SELECT id, name, current, target, unit, archived_at, created_at, updated_at, date(created_at, 'localtime')
FROM goals;

DROP TABLE goals;
ALTER TABLE goals_new RENAME TO goals;

-- The change record's copies of goals get the new columns too, last and in
-- this order, so Undo still matches them, key order included (docs/BLOCKS.md §10).
-- step is the integer 1: Undo compares JSON text, and the row's 1.0 reads back as 1.
UPDATE changes SET
    before = CASE WHEN before IS NULL THEN NULL ELSE json_set(before,
        '$.kind', 'progress', '$.deadline', json('null'), '$.started', date(json_extract(before, '$.created_at'), 'localtime'),
        '$.step', 1, '$.achieved_at', json('null'), '$.dream', 0) END,
    after = CASE WHEN after IS NULL THEN NULL ELSE json_set(after,
        '$.kind', 'progress', '$.deadline', json('null'), '$.started', date(json_extract(after, '$.created_at'), 'localtime'),
        '$.step', 1, '$.achieved_at', json('null'), '$.dream', 0) END
WHERE resource = 'goals';
