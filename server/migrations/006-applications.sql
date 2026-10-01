-- The internship search (DESIGN §3).
CREATE TABLE applications (
    id INTEGER PRIMARY KEY,
    company TEXT NOT NULL CHECK (length(trim(company)) BETWEEN 1 AND 100),
    role TEXT NOT NULL CHECK (length(trim(role)) BETWEEN 1 AND 100),
    status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'interview', 'offer', 'rejected')),
    applied_on TEXT NOT NULL CHECK (applied_on GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    url TEXT CHECK (url IS NULL OR length(url) <= 500),
    notes TEXT CHECK (notes IS NULL OR length(notes) <= 5000),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
