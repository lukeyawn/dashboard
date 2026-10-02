-- A countdown's optional time and how much the tile shows (docs/BLOCKS.md §4).
-- Without a time a countdown counts to the start of its day, as before.
-- Hours and live count down to a moment, so they need a time.
ALTER TABLE countdowns ADD COLUMN target_time TEXT CHECK (target_time IS NULL OR target_time GLOB '[0-2][0-9]:[0-5][0-9]');
ALTER TABLE countdowns ADD COLUMN detail TEXT NOT NULL DEFAULT 'days'
    CHECK (detail IN ('days', 'hours', 'live') AND (detail = 'days' OR target_time IS NOT NULL));

-- The change record's copies of countdowns get the new columns too, last and
-- in this order, as ALTER TABLE added them, so Undo still matches them
-- (docs/BLOCKS.md §10).
UPDATE changes SET
    before = CASE WHEN before IS NULL THEN NULL ELSE json_set(before, '$.target_time', json('null'), '$.detail', 'days') END,
    after = CASE WHEN after IS NULL THEN NULL ELSE json_set(after, '$.target_time', json('null'), '$.detail', 'days') END
WHERE resource = 'countdowns';
