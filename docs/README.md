# docs/

`DESIGN.md` is the source of truth: decisions go there before code. Each topic doc covers one subject in more depth; DESIGN.md summarizes it and points to it, and none of them overrides it.

| File | Purpose |
|---|---|
| `DESIGN.md` | The design: what's decided and why, and what exists. |
| `CONNECTOR.md` | The claude.ai connectors: the public door, sign-in, what each connector can do, Claude's changes and undo, the text and link rules. |
| `AGENT.md` | The scheduled agent and its connector: why it writes directly, its allow-list, the dock chip, and what phase 9 sets up. |
| `BLOCKS.md` | The block redesign (Oct 2), built: why each block is the way it is, and what was rejected. Code comments cite its sections. |
| `UNDO.md` | Undo across migrations (Oct 3): Undo compares column by column, so adding a column no longer means rewriting the change record. Also why field-level undo was rejected. |
| `V2_IDEAS.md` | Ideas from a review of the docs (Oct 3): what's planned, what's dropped, and why. Not decided until moved into DESIGN.md. |
| `DECISIONS.md` | Choices made while building, where DESIGN.md left room or turned out to be wrong in detail, grouped by phase. |
| `archive/` | Superseded docs, kept for how decisions were reached. Not current. |

`archive/`:

| File | What it was |
|---|---|
| `DESIGN-v1.md`, `DESIGN-v2.md` | The two drafts DESIGN.md replaced |
| `DESIGN-5-agent-access.md` | DESIGN.md's old §5.1–5.5, cut to a summary once CONNECTOR.md and AGENT.md covered it |
| `DESIGN-history.md` | DESIGN.md's decision log (§15) and what changed from the drafts (§17), moved out Oct 3 |
| `CONNECTOR-v1.md` | The first CONNECTOR.md, with the agent's suggestions and their review, before AGENT.md replaced them |
