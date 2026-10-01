-- Every write, from anyone, with who made it and the row before and after, so
-- anything can be reviewed and undone (DESIGN §5.5). before and after are JSON.
CREATE TABLE changes (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    actor TEXT NOT NULL CHECK (actor IN ('owner', 'kiosk', 'claude', 'agent', 'system')),
    resource TEXT NOT NULL,
    item_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    before TEXT CHECK (before IS NULL OR json_valid(before)),
    after TEXT CHECK (after IS NULL OR json_valid(after))
) STRICT;

CREATE INDEX changes_at ON changes (at);
