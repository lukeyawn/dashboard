-- Which claude.ai connection made a change, if any (docs/CONNECTOR.md §6).
-- Empty for the owner, the kiosk and Claude Code.
ALTER TABLE changes ADD COLUMN connection_id INTEGER;

CREATE INDEX changes_item ON changes (resource, item_id);
