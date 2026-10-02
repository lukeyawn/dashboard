-- A habit's weekly target (docs/BLOCKS.md §2): 7 is daily, as before.
ALTER TABLE habits ADD COLUMN per_week INTEGER NOT NULL DEFAULT 7 CHECK (per_week BETWEEN 1 AND 7);

-- The change record's copies of habits get the new column too, as the last
-- key, as ALTER TABLE added it, so Undo still matches them (docs/BLOCKS.md §10).
UPDATE changes SET
    before = CASE WHEN before IS NULL THEN NULL ELSE json_set(before, '$.per_week', 7) END,
    after = CASE WHEN after IS NULL THEN NULL ELSE json_set(after, '$.per_week', 7) END
WHERE resource = 'habits';
