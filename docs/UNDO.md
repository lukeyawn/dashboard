# Undo across migrations

Oct 3, 2026 · Luke (owner, design and review) · Claude (implementation)

This came from [V2_IDEAS.md idea 3](V2_IDEAS.md#3-undo-across-migrations). Undo keeps its strict rule: it refuses whenever the item has changed in any way since. What changes is that **a migration adding a column that stands on its own, or rebuilding a table, no longer has to rewrite the change record** for older changes to stay undoable. It also turns two kinds of database error that are 500s today into the usual 409.

Field-level undo, the original idea, was designed and then rejected. §5 says why.

There's no migration and no new API.

---

## 1. How Undo compares now

[server/undo.js](../server/undo.js) undoes one change from the change record (DESIGN §5.5). Each change holds the whole row before and after, as stored. Undo of an update or a create proceeds only if the current row is exactly the change's `after`, compared as **one JSON string**.

That string comparison is stricter than the rule needs:
- **A column added since** is in the current row but not in the old copy, so the strings differ and every older change to that table is refused with *"It has changed since"*, which isn't true.
- **Key order** is part of the string, so a rebuilt table has to keep its columns in the old order, with new ones last.

So BLOCKS.md §10 has every such migration rewrite every copy in `changes`, key order included. Migrations 012, 013, 014, 016 and 017 all did.

---

## 2. The change: compare column by column

**The check, for an update or a create:** every column in the change's `after` copy must hold that value in the current row now, compared as JSON values, one column at a time.
- `updated_at` and `created_at` are among those columns, as now:
  - `updated_at` catches any edit since, to any column, including one the copy doesn't have.
  - `created_at` catches a reused id. Tables use `INTEGER PRIMARY KEY` without `AUTOINCREMENT`, so SQLite gives a deleted row's id to the next new row if it was the highest.
- **A column the table has gained since** isn't in the copy, so it isn't compared. That's safe because any later edit to it would have changed `updated_at`.
- **Key order** doesn't matter any more.

**This makes `updated_at` load-bearing.** Today the whole-row comparison catches any later edit, whether or not it set `updated_at`. With this change, a column added since is protected **only** by `updated_at`. So:
- **The rule:** every write to a row of the six tables (`tasks`, `areas`, `countdowns`, `goals`, `habits`, `applications`) sets `updated_at`. It holds today: `crud.js`, the raw `UPDATE` in `areas.js` (clearing a deleted area from its tasks) and `undo.js`'s `restoreArea` all set it to now. It goes into DESIGN.md §14 next to the migration rule, and a test checks every write path (§6).
- **Undo's own write is the one exception, and it's safe.** Undoing an update writes `before`'s `updated_at` back, an old value. But it only gets that far if nothing has changed since, so a column the copy lacks still holds what it held then, and the row it leaves is exactly the row as it stood at that old time.
- **A store that broke it** would let Undo overwrite a later edit to a new column without saying so, which is why the rule gets a test and isn't left implicit.
- **Writes in the same millisecond can't fool it.** `updated_at` only protects a column the copy lacks, so the change is from before the migration that added it, and any write that could touch that column came after the migration, at a later time.

**A copy with a column the table doesn't have** is refused with 409: *"That change is from before the table changed, so it can't be undone."*
- That's a column dropped or renamed by a migration that didn't rewrite the copies.
- Refusing is louder than ignoring it. Ignoring it would undo the other columns and quietly leave out the renamed one.
- This applies to undoing a delete too. Today a delete's undo silently skips such a column, which would lose a renamed column's value.
- The extra keys the record keeps on deletes (`_checks` on habits, `_tasks` on areas) aren't columns and are left out of this rule.

**The write is unchanged:** an update's undo writes back every column of `before`, a create's deletes the row, and a delete's inserts the row again.

Settings and habit checks are unchanged. Each one is a single value.

### Database errors become 409s

Undo restores a whole row that was valid when it was recorded, so a CHECK on the row itself fails only after a migration changed the rules: one that tightened a CHECK, or added a column tied to the old ones that it didn't set in the copies (§3). A UNIQUE index across rows can fail any time, and it's a 500 today. Inside **Undo everything since** it also stops the whole batch instead of being skipped.

SQLite names a failed UNIQUE constraint by its columns (`UNIQUE constraint failed: countdowns.pinned`), not by index name, so the message is chosen by table and column:

| Column (index) | How undo hits it | Message |
|---|---|---|
| `countdowns.pinned` (`countdowns_one_pinned`) | Pinning B records A's unpin as a change of its own, before B's pin. Undoing A's unpin alone would pin two. So would undoing the delete of a pinned countdown while another is pinned. (**Undo everything since** is fine: newest first, it undoes B's pin before A's unpin.) | *"Another countdown is pinned now. Unpin it, then undo this."* |
| `areas.name` (unique, ignoring case) | Undoing a rename after a new area has taken the old name | *"There's an area called School again since."* (as undoing a delete already says) |
| `source` on `tasks`, `applications`, `countdowns` (`*_source`) | Mostly **undoing a delete**: Luke deletes a task the agent made from an email, the next run makes it again from the same email ([V2_IDEAS.md idea 1](V2_IDEAS.md#1-label-the-emails-the-agent-has-triaged)), and Luke then undoes his delete. Rarer: undoing a change to `source` after another item took it. | *"Another item has come from the same source since."* |

Any other constraint failure (CHECK, NOT NULL) becomes a 409 with *"Undoing this would leave it inconsistent."* That's a backstop for the migration cases above; nothing in today's schema triggers it. The foreign-key case (an area deleted since) keeps its own message.

Each undo already runs as a savepoint inside `undo.since`'s transaction, so a refused one leaves nothing behind and the batch carries on.

---

## 3. Migrations, from now on

This replaces BLOCKS.md §10's "Migrations and Undo", and moves into DESIGN.md §14:

| A migration that | Does to the copies in `changes` | If forgotten |
|---|---|---|
| Adds a column that stands on its own (a default, or empty) | Nothing | — |
| Adds a column filled from other columns, or tied to them by a CHECK | Sets it in `before` and `after`, as for the rows | **Not refused.** Undoing an older change writes the old columns back and leaves the new one as it is, so it can end up wrong with no warning, or fail the CHECK (the backstop 409 in §2). |
| Rebuilds a table (column order) | Nothing | — |
| Drops a column | `json_remove` the key from `before` and `after` | Undo refuses older changes (§2) |
| Renames a column | Renames the key (`json_set` + `json_remove`) | Undo refuses older changes (§2) |
| Changes stored values (`high` → `now`) | Maps them in `before` and `after`, as for the rows | Updates and creates are refused: the value in `after` doesn't match. An old value in `before`, or in a deleted item, is written back, and only a CHECK on the column catches it. |

Forgetting a dropped or renamed column always leads to a refusal you can see. The other two rows are where forgetting can slip through, so each such migration's test still undoes an older change and checks the row it leaves.

**Accepted (Luke, Oct 3): the tied-column row stays a convention, not a refusal.** Making it loud would mean recording the schema version on every change, and having such migrations mark a barrier that Undo refuses to cross. That's a migration and a list to maintain, for a case no past migration has hit. Two filled a new column from an old one, and neither could have gone wrong silently: 016's `started` comes from `created_at`, which never changes, and 014's `area_id` came from `area`, which 014 also dropped, so a forgotten copy would have been refused. The migration test is the guard.

---

## 4. Files

| File | Change | Why |
|---|---|---|
| `server/undo.js` | `same()` (one JSON string) becomes a column-by-column check over the copy's columns, refusing a copy with a column the table lacks. Updates, creates and deletes all use it. UNIQUE, CHECK and NOT NULL failures become 409s, with the messages in §2. | §2 |
| `server/changes.test.js` | The tests in §6. The existing ones stay as they are. | |
| `src/agent/AgentChanges.jsx` and its test | The skip summary gives each kept item with the server's own message, as History does for a single undo: "Couldn't undo 2: Added task "X" (It has changed since, so…); Unpinned countdown "Y" (Another countdown is pinned now…)", in place of "Kept 2 you've changed since". The `reason` is already in each skipped item, so the API doesn't change. | Skips now also come from clashes and old copies, where Luke changed nothing |
| `src/manage/ClaudeChanges.jsx` and its test | The same, for "Skipped N you've changed since" | As above |
| `server/README.md` | `undo.js`'s line: compared column by column, with columns added since ignored | The README describes each file |
| `docs/DESIGN.md` | §14 gets the migration rule (§3) and the `updated_at` rule (§2). §5.5 gets a pointer here. | DESIGN.md describes what exists |
| `docs/BLOCKS.md` | §10's "Migrations and Undo" becomes a pointer to DESIGN.md §14 | Replaced. V2_IDEAS idea 6 archives BLOCKS.md later. |
| `docs/DECISIONS.md` | A section for this PR | As for every PR |
| `docs/V2_IDEAS.md` | Idea 3's status: built | Its status table |

**Not changed:** the migrations (none edited, none added); `server/changes.js` (what's recorded is unchanged); the routes; the stores; `mcp/`.

**Before deploying,** run this on a copy of the live database (the latest nightly snapshot). It lists change copies with a key their table doesn't have, in `before` or `after`, for the six tables Undo compares as rows. `habit_checks` and `settings` copies aren't rows, and `_checks` and `_tasks` aren't columns (§2).

```sql
SELECT c.id, c.resource, k.key
FROM changes c, json_each(c.before) k
WHERE c.resource IN ('tasks', 'areas', 'countdowns', 'goals', 'habits', 'applications')
  AND k.key NOT IN ('_checks', '_tasks')
  AND k.key NOT IN (SELECT name FROM pragma_table_info(c.resource))
UNION
SELECT c.id, c.resource, k.key
FROM changes c, json_each(c.after) k
WHERE c.resource IN ('tasks', 'areas', 'countdowns', 'goals', 'habits', 'applications')
  AND k.key NOT IN (SELECT name FROM pragma_table_info(c.resource));
```

It should return nothing, since every past migration rewrote its copies. If it returns rows, those changes would start refusing, and the rewrite should be fixed first.

---

## 5. Rejected: field-level undo

The first version of this doc had Undo check and write only the fields a change changed, so an unrelated later edit wouldn't block it. The review (Oct 3) found too many ways for it to go wrong **without saying so**:

- **A reused id.** It dropped `created_at` from the check, so the agent's change to task 50 could be undone onto a new task that had been given id 50 after the old one was deleted.
- **A goal's `achieved_at`** was both checked and worked out again afterwards. That refused undos that didn't really conflict (the target raised since), and it stamped the undo's time over the original achievement.
- **Clashes no constraint catches.** The agent gives a task a repeat rule and Luke ticks it, which moves `due` forward and sets `last_done_at`. Undoing the repeat alone would succeed, leaving an open task with a later due date: Luke's completion gone, with no warning. Today that undo is refused.
- **Clashes the doc missed:** a countdown's `detail` needing a `target_time` (a CHECK), and the one-pinned index.

Each could be patched (field groups per table, `created_at` in the check, derived fields left out of the check), but every patch is one more rule to keep right. The gain is small: an undo refused today is visible, and Luke can fix the item by hand. **An undo that half-works without saying so is worse than one that refuses.**

---

## 6. Tests

In `server/changes.test.js`, under `undo`:

- **A column added since doesn't block undo:** add a column with `ALTER TABLE ADD COLUMN` in the test, then undo an older update, create and delete.
- **Key order doesn't matter:** a copy with its keys reordered still undoes.
- **A copy with a column the table lacks is refused,** for an update, a create and a delete, and nothing changes.
- **Any later edit still refuses,** to any column (the existing a → b → c test).
- **A reused id is refused:** a change to a deleted task can't be undone onto a new task that got its id.
- **The pinned countdown:**
  - pin B, then undo A's unpin alone: 409 with the message, and B is still the only pinned one;
  - delete pinned A, pin B, then undo A's delete: the same;
  - pin B, then **Undo everything since**: both undone, and A is pinned again.
- **A source taken since:** delete a task that has a `source`, create another with the same `source`, then undo the delete: 409 with the message, and nothing is inserted.
- **An area rename clash:** 409 with the message.
- **The backstop:** a copy whose `before` holds a value the column's CHECK no longer allows (`priority: 'high'`) answers 409 with *"Undoing this would leave it inconsistent"*, not 500.
- **Undo everything since skips a clash** and carries on with the rest.
- **Every write path sets `updated_at`** (§2): for each of the six tables, set a row's `updated_at` to an old sentinel directly in SQL, make each kind of write through the API (edit, the quick actions, pinning, an area's move and delete clearing its tasks, a recurring task's roll-forward, and undoing an area's delete putting it back on its tasks), and check the row no longer has the sentinel. A sentinel, not a comparison with the previous value, because two writes can land in the same millisecond.
- **The skip summaries** in `AgentChanges` and `ClaudeChanges` show each skipped item's reason.
- **The migration tests** (012–018) still pass unchanged. A future migration that adds a tied column (§3) has a test that undoes an older change and checks the row it leaves.
