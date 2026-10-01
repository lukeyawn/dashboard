-- Deadlines become tasks with a due date, and tasks gain optional details that
-- Claude fills in (DESIGN §3, §5.5). source names where an item came from, such
-- as an email, so the same email can't create it twice.
ALTER TABLE tasks ADD COLUMN due TEXT CHECK (due IS NULL OR due GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]');
ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low'));
ALTER TABLE tasks ADD COLUMN effort TEXT CHECK (effort IS NULL OR effort IN ('quick', 'medium', 'big'));
ALTER TABLE tasks ADD COLUMN area TEXT CHECK (area IS NULL OR length(area) BETWEEN 1 AND 60);
ALTER TABLE tasks ADD COLUMN notes TEXT CHECK (notes IS NULL OR length(notes) <= 5000);
ALTER TABLE tasks ADD COLUMN link TEXT CHECK (link IS NULL OR length(link) <= 500);
ALTER TABLE tasks ADD COLUMN source TEXT CHECK (source IS NULL OR length(source) BETWEEN 1 AND 200);
CREATE UNIQUE INDEX tasks_source ON tasks (source) WHERE source IS NOT NULL;

INSERT INTO tasks (name, due, area, done_at, created_at, updated_at)
SELECT name, due, course, done_at, created_at, updated_at FROM deadlines ORDER BY id;
DROP TABLE deadlines;

ALTER TABLE countdowns ADD COLUMN source TEXT CHECK (source IS NULL OR length(source) BETWEEN 1 AND 200);
CREATE UNIQUE INDEX countdowns_source ON countdowns (source) WHERE source IS NOT NULL;

ALTER TABLE applications ADD COLUMN source TEXT CHECK (source IS NULL OR length(source) BETWEEN 1 AND 200);
CREATE UNIQUE INDEX applications_source ON applications (source) WHERE source IS NOT NULL;
