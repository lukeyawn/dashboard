-- Tasks get editable areas, now/soon/someday, time estimates and recurrence
-- (docs/BLOCKS.md §3).

-- A list Luke edits; Claude only chooses from it. Names are unique ignoring case.
CREATE TABLE areas (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 40),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO areas (name, position) VALUES
    ('School', 0), ('Work', 1), ('Job search', 2), ('Home', 3), ('Health', 4), ('Personal', 5), ('Errands', 6);

-- SQLite can't change a CHECK in place, so tasks is rebuilt. Its columns keep
-- their old order, minus effort and area, with the new ones last:
--   priority: high / normal / low → now / soon / someday
--   area (free text) → area_id, matched to an area by name where one fits
--   effort → minutes, an optional estimate (effort is dropped: no real data yet)
--   repeat: a recurrence rule as JSON; completing the task moves due forward
--   last_done_at: when a recurring task was last completed
CREATE TABLE tasks_new (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    done_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    due TEXT CHECK (due IS NULL OR due GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    priority TEXT NOT NULL DEFAULT 'soon' CHECK (priority IN ('now', 'soon', 'someday')),
    notes TEXT CHECK (notes IS NULL OR length(notes) <= 5000),
    link TEXT CHECK (link IS NULL OR length(link) <= 500),
    source TEXT CHECK (source IS NULL OR length(source) BETWEEN 1 AND 200),
    area_id INTEGER REFERENCES areas (id) ON DELETE SET NULL,
    minutes INTEGER CHECK (minutes IS NULL OR minutes BETWEEN 1 AND 10000),
    repeat TEXT CHECK (repeat IS NULL OR (json_valid(repeat) AND due IS NOT NULL)),
    last_done_at TEXT
) STRICT;

INSERT INTO tasks_new (id, name, done_at, created_at, updated_at, due, priority, notes, link, source, area_id)
SELECT id, name, done_at, created_at, updated_at, due,
    CASE priority WHEN 'high' THEN 'now' WHEN 'low' THEN 'someday' ELSE 'soon' END,
    notes, link, source,
    (SELECT areas.id FROM areas WHERE areas.name = tasks.area)
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE UNIQUE INDEX tasks_source ON tasks (source) WHERE source IS NOT NULL;
CREATE INDEX tasks_area ON tasks (area_id);

-- The change record's copies of tasks get the same changes, so Undo still
-- matches them, key order included (docs/BLOCKS.md §10): effort and area
-- removed, priority mapped in place, and the new columns added last.
UPDATE changes SET
    before = CASE WHEN before IS NULL THEN NULL ELSE json_set(json_remove(before, '$.effort', '$.area'),
        '$.priority', CASE json_extract(before, '$.priority') WHEN 'high' THEN 'now' WHEN 'low' THEN 'someday' ELSE 'soon' END,
        '$.area_id', (SELECT areas.id FROM areas WHERE areas.name = json_extract(before, '$.area')),
        '$.minutes', json('null'), '$.repeat', json('null'), '$.last_done_at', json('null')) END,
    after = CASE WHEN after IS NULL THEN NULL ELSE json_set(json_remove(after, '$.effort', '$.area'),
        '$.priority', CASE json_extract(after, '$.priority') WHEN 'high' THEN 'now' WHEN 'low' THEN 'someday' ELSE 'soon' END,
        '$.area_id', (SELECT areas.id FROM areas WHERE areas.name = json_extract(after, '$.area')),
        '$.minutes', json('null'), '$.repeat', json('null'), '$.last_done_at', json('null')) END
WHERE resource = 'tasks';
