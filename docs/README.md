# docs/

| File | Purpose |
|---|---|
| `DESIGN.md` | The design: what's decided and why. It's the source of truth, and decisions go here before code. |
| `CONNECTOR.md` | Phase 8's detailed design: the claude.ai connectors, sign-in, Claude's changes and undo. |
| `BLOCKS.md` | The redesign of the dashboard's blocks (Oct 2), with its build order. Newer than DESIGN.md §10 until each part is built. |
| `DECISIONS.md` | Choices made while building, where DESIGN.md left room or turned out to be wrong in detail, grouped by phase. |
| `archive/` | The earlier design drafts that DESIGN.md replaced, and DESIGN.md's old §5.1–5.5 (cut to a summary once CONNECTOR.md and AGENT.md covered it), kept for how decisions were reached. Not current. |
| `UNDO.md` | Undo across migrations (Oct 3): Undo compares column by column, so adding a column no longer means rewriting the change record. Also why field-level undo was rejected. |
| `V2_IDEAS.md` | Ideas from a review of the docs (Oct 3): what's planned, what's dropped, and why. Not decided until moved into DESIGN.md. |
| `AGENT.md` | The scheduled agent's connector (Oct 2): it writes directly instead of suggesting. Newer than CONNECTOR.md §7–8. |
