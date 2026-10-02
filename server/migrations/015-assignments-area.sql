-- The Assignments tile's area (docs/BLOCKS.md §3) starts as School, stored by
-- id so renaming the area later doesn't move the tile. Without a School,
-- nothing is stored and the tile asks for an area.
INSERT OR IGNORE INTO settings (key, value)
SELECT 'assignments_area', CAST(id AS TEXT) FROM areas WHERE name = 'School' COLLATE NOCASE;
