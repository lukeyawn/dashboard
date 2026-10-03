-- The agent names each run with a label it chooses, such as "Email
-- 2026-10-03 06:00", instead of asking for an id first (docs/AGENT.md §7).
-- The first change with a new label opens its run, on the server's clock,
-- and report_run closes it. Runs from before this have no label.
ALTER TABLE runs ADD COLUMN label TEXT CHECK (label IS NULL OR length(label) BETWEEN 1 AND 60);

CREATE UNIQUE INDEX runs_label ON runs (label) WHERE label IS NOT NULL;
