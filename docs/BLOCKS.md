# The block redesign

Oct 2, 2026 · Luke (owner, design and review) · Claude (implementation)

After a few days of using the live dashboard, Luke went through it block by block. This doc records what each block becomes, and why. Where this doc and [DESIGN.md](DESIGN.md) differ, this doc is newer. Each code PR updates DESIGN.md to describe what it built (§10's widget specs, §3's data model and so on), so DESIGN.md stays the description of what exists.

Nothing here is built yet. The build order is in §11.

**In short:**
- The calendar becomes **Upcoming**, the next 4 days of events.
- **Habits** get a weekly target.
- **Tasks** get editable areas, now/soon/someday, time estimates, recurrence, and sort and filter on the tile.
- **Due soon** becomes **Assignments**.
- **Countdowns** get a time, finer units, and a live clock.
- **Goals** get deadlines with pace, milestones and dreams.
- **Job search** becomes a list of what's next, with a notes panel.
- The **change record** is kept forever, for a year in review.

The agent's connector is redesigned separately, in its own doc.

---

## 1. Upcoming, replacing the calendar

**Why:** the calendar repeated what other tiles already show:
- the date is in the dock;
- the dots for due dates are in Due soon;
- birthdays and countdowns are in Countdown and Today.

Its only unique part was the month grid, which is rarely needed. Meanwhile nothing on the screen showed the days after today.

**What it shows,** in the same 4×2 tile: the 4 days after today, starting tomorrow (Today already covers today). The 4 is a constant in the widget, not a setting.

- **Four day boxes side by side,** as full-height columns. Each is one grid cell wide (about 150 × 270 px at the reference screen), so the boxes line up with the tiles below.
  - Header: the weekday, with the date below it.
  - Birthdays and all-day events: chips at the top.
  - Events: the start time, and the title clamped to 2 lines (about 16 characters a line), both at `--fs-small`. "+N" when the column is full, at about 4–5 events.
- **Empty days are dimmed boxes,** not collapsed: they show time as it really passes.
- A divider at the start of the week, the same as in Habits (`week_start`, §2).
- **Only events and birthdays.** Tasks live in Tasks and Assignments (§3), and countdowns in the Countdown tile.
- Titled "Upcoming". No tap actions and no ✎, like Today.

**Classes are kept out by calendar, not by recurrence.** Luke tutors on a recurring schedule, and that has to show, so hiding recurring events was rejected. Classes, though, would fill every day, and they still belong on the Today timeline. So the dashboard reads a second, optional calendar:

| Calendar | Today | Upcoming |
|---|---|---|
| Main (`GCAL_ICS_URL`): tutoring, appointments, time blocks, one-offs | ✓ | ✓ |
| Classes (`GCAL_ROUTINE_ICS_URL`, new and optional) | ✓ | ✗ |

- `server/index.js` creates a second `createCalendarFeed`.
- Its occurrences are tagged `routine: true` and merged into `/api/events`. Upcoming leaves them out.
- The variable is optional, so an existing `.env` keeps working. It goes into `.env.example` and `vm/SETUP.md`.

**Data:** the existing `GET /api/events?from&to` and birthdays routes. No migration.

**Dropped:** the big date, the month grid and its dots.

---

## 2. Habits: a weekly target

**Why:** a habit is a yes or no for each day, with a streak of consecutive days. Something done three times a week, like the gym, can never build a streak.

**What changes:**
- **`per_week`,** from 1 to 7, defaulting to 7. A habit at 7 behaves exactly as habits do now.
- **Weeks are calendar weeks,** starting on the new **`week_start` setting** (`sunday` or `monday`, defaulting to `sunday`).
  - It's set in the Settings editor, next to the night hours.
  - The chat connector may change it too: it's harmless.
  - Settings are key-value JSON, so the setting needs no migration.
- **The row:**
  - The 7 dots stay as the last 7 days, so a forgotten day can still be filled in.
  - A thin divider marks where the week starts.
  - A habit under 7 a week also shows "2/3 this week", in accent once met.
- **The streak:**
  - At 7 a week: days in a row, as now.
  - Below 7: weeks in a row that met the target. It ends with this week if the target is already met, and with last week otherwise, so it doesn't drop to 0 every Monday.
- **Calculated on every read:** counts and streaks come from the stored check dates each time, so changing `week_start` loses nothing.

**Logging stays manual:** a tap on the kiosk, `/manage`, or telling Claude. Luke plans to tell Claude each night ("I went to the gym today"), and `check_habit` already does that.

**Rejected or deferred:**
- **A general tracker** (counts, 1–5 scales such as mood, private rows). Luke expects manual tracking of extras to lapse after a week, so the extra kinds would sit unused.
- **Logging from the phone automatically** (a narrow "shortcut" token for an iOS Shortcuts or Tasker automation, triggered by arriving at the gym or tapping an NFC sticker). Deferred. It's about 5 minutes of setup on each new phone, for automating a single tap. Checks signed by Tailscale identity, with no token, are held in reserve.
- **Emailing yourself, for Claude to triage.** Rejected: it needs the same phone triggers, and an email is spoofable data (DESIGN §5.2).
- **Habits derived from data** ("applied to a job today", from `applications`) and polling LeetCode or GitHub: ideas for later.
- **Laundry** is a chore, not a habit. It's a recurring task (§3).

**Files:**
- a migration (`per_week INTEGER NOT NULL DEFAULT 7 CHECK (per_week BETWEEN 1 AND 7)`);
- `shared/schemas.js` (the habit shape, and `week_start` in `settingsUpdate`);
- `server/stores/habits.js` (`streak()` takes the target and the week start; the list adds the count this week);
- `server/access.js` (the comment on what chats may set);
- `SettingsEditor`;
- the Habits widget;
- `server/seed.js`;
- the MCP tool descriptions.

**Tests:**
- the Saturday to Sunday and Sunday to Monday boundaries, with each `week_start`;
- a partial current week;
- `per_week` 7 matching the old behavior;
- the time zone.

---

## 3. Tasks and Assignments

**Why:** most of the fields already exist (phase 7: `due`, `priority`, `effort`, `area`, `notes`, `link`, `source`), but the tile showed only the name, a "!" and a "quick" tag. Claude enters most tasks, so tagging costs Luke nothing, and the fields are worth showing.

### One central place for tasks

A dashboard is read at a glance, and scattering tasks across several tiles works against that. Tasks already has the biggest tile.

- **Planning happens in Google Calendar,** as time blocks ("work on problem set 4"). Each night, Luke plans the next day with Claude, which creates the blocks through its Google Calendar connector. They show on Today and Upcoming as ordinary events within the feed's 10-minute refresh. There's no planned date on tasks.
- **Today and Upcoming stay calendar-only.**
- **Due soon becomes Assignments.** Every other task is in Tasks.

### Areas: a list you edit in the app

Free text would drift ("School", "school", "CS 341"), so areas are a list. Luke can add to it, rename and delete. Claude can only choose from it.

- **The `areas` table:** `id`, `name` (unique, ignoring case) and `position`.
  - Seeded with School, Work, Job search, Home, Health, Personal, Errands.
- **Tasks store `area_id`.** Renaming an area renames it on every task. The free-text `area` column is dropped: there are no real tasks yet.
- **Adding:** the task editor's area field is a dropdown of the list, plus "New area…", which shows a text box. A name that matches an existing area, ignoring case, picks that area instead of making a duplicate.
- **Managing:** an Areas section on `/manage` to rename, reorder and delete.
  - Deleting an area clears it from its tasks. The change record keeps those task ids, so Undo restores both, as deleting a habit keeps its check dates.
- **Claude chooses but can't create:**
  - there's no area-creating route on the chat connector;
  - an unknown area on `add_task` or `update_task` is refused with the list of valid ones;
  - the tool descriptions tell Claude to ask when nothing fits.
- **The kiosk's "+ Add task" row** stays name-only. The area is set in the ✎ editor or on `/manage`.
- **Areas have no colors.** The area shows only through the tile's filter.

### Priority: when you intend to do it

`high` / `normal` / `low` become **`now` / `soon` / `someday`**, defaulting to `soon`.
- **The stored values change, not just the labels.** Claude reasons from the value names, and "low" would invite it to file unimportant-but-urgent things as someday.
- **The migration** maps the old values in `tasks` and also rewrites them in the change record, so undoing an old change still works.

### Time estimates instead of effort

`effort` (quick / medium / big) becomes **`minutes`**, an optional estimate, usually Claude's.
- The editor offers 5, 15, 30, 60 and 60+.
- **Chip text:** "15m" under an hour, "1h" at an hour, and "1h+" above. Past an hour the precision isn't real, and that covers multi-day work and assignments.
- **Chip color:**
  - 15 minutes or less: green;
  - up to an hour: neutral;
  - over an hour: violet.
- The migration drops `effort`, since there's no real data yet.

### Recurrence

For chores such as laundry and rent.
- **A recurring task needs a due date,** and the rule moves it forward. Laundry, for example, is "due Sunday, every week".
- **Completing it rolls it forward** instead of marking it done: `due` moves to the next occurrence.
  - It's one update, so Undo works as it does now, and the change record keeps the history ("Completed Laundry, next Sun").
- **The next occurrence is the first after today.** A late completion skips the missed dates, so nothing piles up.
- **The rule is structured, not iCal RRULE:** `{ every, unit: day | week | month | year, weekdays?, day_of_month? }`. It's checked by the shared schema and shown in words ("every 2 weeks").
- **Stopping:** clear the rule in the editor, or Claude can clear it, since Claude can't delete.
- **The line with habits:** a habit is for streaks; a recurring task is a chore that has to get done.

### The Assignments tile, replacing Due soon

- **Shows:** tasks in the assignments area that have a due date, nearest first.
  - Overdue, and due within 2 days, are in `--urgent`.
  - "+N" when it overflows.
  - **No 14-day cutoff:** with only assignments in it, the tile won't flood, and next month's paper is worth seeing early.
- **Tap to complete,** with the 5-second pending tap, as now.
- **Which area:** the `assignments_area` setting (an area id, defaulting to School). Renaming the area doesn't break the tile. If the area is deleted, the tile says "Pick an area for Assignments in Settings".

### The Tasks tile

Every other open task, including deadlines that aren't school ("Pay rent, due Thu").

**The default order:** now → soon → someday, then due date, then shortest first, then oldest first.

**The row, left to right:**

```
 TASKS · School                                   Sort ▾  Filter ▾  ✎
 ○  !  Email Prof. Lee about the extension              Thu   [15m]
 ○     Pay rent                                ↻    2 days    [ 5m]
 ○     Book dentist appointment                               [ 5m]
 ─ SOMEDAY ─────────────────────────────────────────────────────────
 ○     Learn to make dumplings                                [1h+]
```

1. **The checkbox.** Tapping anywhere on the row completes the task, with the pending tap.
2. **The now marker:** a bold "!" in `--urgent`. It's a styled character, not an emoji:
   - Inter has no emoji;
   - the Pi may have no color emoji font;
   - emoji look different on every system.

   Its column stays even when empty, so names line up.
3. **The name:** one line, cut off with "…".
4. **↻**, muted, on recurring tasks.
5. **The due label,** when there's a due date:
   - "today", "tomorrow", a weekday within 6 days, otherwise "Oct 14";
   - `--urgent` within 2 days or overdue;
   - built from `src/widgets/due/daysLabel.js`.
6. **The time chip.**
7. **✦** on items Claude created.

**Someday tasks are shown, not hidden:** hiding them turns them into never-tasks.
- Their text is muted.
- In the default order, a small "Someday" divider in the title style separates them from the rest.
- With another sort there's no divider.
- When the tile is full, the last row becomes "+N more", so someday tasks are the first to drop off.

**"+ Add task"** stays at the bottom.

**Sort and filter on the tile:**
- **Two buttons in the header,** "Sort ▾" and "Filter ▾", beside ✎. Each opens a menu sized for touch.
  - They're not on the title, which click-to-focus reserves (DESIGN §12).
- **Sort:** priority (the default), due date, shortest first, newest.
- **Filter:** one area or all, and optionally "15 min or less".
- **A filtered list is labelled:** the header shows the filter ("Tasks · School"), so it's never mistaken for the whole list.
- **The kiosk resets** to the default after 5 minutes idle (`useIdle`), so the wall can't stay filtered for days unnoticed. Elsewhere, the choice stays until changed.

**Rejected:**
- a planned date, a start date, a due time, and "waiting on";
- tasks shown in Today or Upcoming;
- folding Due soon into Tasks;
- an area color strip;
- emoji markers;
- collapsing someday tasks into one line;
- subtasks.

**Files:**
- **One migration:** the `areas` table and its seed rows; `area` → `area_id`; the priority values (in `tasks` and in `changes`); `effort` → `minutes`; `repeat`.
- **Shared:**
  - `shared/schemas.js` (`PRIORITIES`, areas, `minutes`, `repeat`, and `assignments_area` in settings);
  - `shared/tasks.js` (`compareTasks`, and `isDueSoon` → is it an assignment);
  - a next-occurrence helper in `shared/`.
- **Server:**
  - `server/stores/areas.js` and its routes;
  - the task store's complete path (rolling forward);
  - `server/access.js` (areas are read-only for chats).
- **Frontend:**
  - `src/widgets/due` → `src/widgets/assignments`;
  - `src/widgets/tasks`;
  - a shared menu component (Job search uses it too);
  - the editors (the area dropdown, `minutes`, the repeat rule);
  - the Areas section on `/manage`;
  - `describeChange.js`;
  - the chip tokens;
  - `src/layout.js` (`due` → `assignments`);
  - the e2e layout tests.
- **MCP:** the tool descriptions (priority values, choosing from the areas, recurrence, planning with calendar time blocks).

**Tests:**
- the migration, on a database with old priorities and old changes;
- next occurrences across month ends, leap years, weekday sets and DST;
- rolling forward, and undoing it;
- deleting an area and undoing it;
- refusing an unknown area;
- each sort and filter;
- the idle reset.

---

## 4. Countdown

**The bug that started this:** the one countdown, "New Years!", was saved for 2026-01-01, which had already passed. `chooseCountdown()` leaves out past dates, so the tile said "No countdowns" while one existed.

**Reject past dates, loudly:**
- The server, which knows the dashboard's time zone, refuses a create or change whose date (and time) has passed.
- The message: *"That date has passed (Jan 1, 2026). Did you mean 2027?"* The year hint is shown when the same date next year is in the future.
- Today is allowed. A timed countdown is allowed until its time.
- The editor shows the message beside the field, and Claude gets the same text.

**Archived automatically, by date:**
- A countdown is past from the day after its target. It's worked out every time, so there's no column and no job, and it can't go stale.
- The tile and `list_countdowns` show only current countdowns. `?past=true` lists the past ones.
- The editor gets a "Past" filter, to review and delete them.
- A pinned countdown that has passed no longer counts as pinned.

**An optional time,** `target_time` (local HH:MM). Without one, a countdown counts to the start of its day, as now.

**`detail`, a choice per countdown:**

| `detail` | Shows |
|---|---|
| `days` (default) | Weeks above 60 days, then days, then "Today", as now |
| `hours` | As `days`, then hours under 48 hours and minutes under 1 hour |
| `live` | As `hours`, then a ticking H:MM:SS in the last 24 hours. In the last minute, the seconds alone fill the tile (New Year's). |

- `hours` and `live` need a time; the editor and the server refuse them without one.
- With `days`, the time still matters: it decides when the tile switches to the label alone, and when the countdown passes.
- The widget ticks every second only during a live countdown's last day, and every minute otherwise.
- In the editor, `detail` is a three-way control under the time field.
- It's one field rather than two switches, so "live but no hours" can't happen.

**Files:**
- a migration (`target_time`; `detail TEXT NOT NULL DEFAULT 'days' CHECK (detail IN ('days', 'hours', 'live'))`);
- `shared/schemas.js`;
- `server/stores/countdowns.js` (the past-date check, the past filter);
- `src/widgets/countdown/countdown.js` (times, units, the live clock);
- the widget;
- the editor;
- the MCP descriptions.

**Tests:**
- the hour, day and DST boundaries;
- the last minute;
- the year hint;
- a pinned countdown that has passed.

---

## 5. Goals

**Why:** a goal is `name`, `current`, `target`, `unit`, and nothing else. It can't tell you whether you're on track, and some goals aren't counts at all.

**An optional deadline, with pace:**
- New fields: `deadline` (optional) and `started` (defaulting to the day the goal is created).
- **With a deadline:**
  - a tick on the bar marks where steady progress would be today;
  - the text reads "12/50 · 3 wk left";
  - the fill turns amber when it's more than 10% of the target behind the tick. Never red.
- **Without one,** the goal shows as now.

**Step:** a `step` for the + button (defaulting to 1), so the button can read "+10" for pages or "+0.5" for kilometers. Undo takes the same amount off.

**"+N this week":** next to each progress goal.
- It's summed from the change record's increments since the start of the week (`week_start`).
- It's hidden when 0.
- It rewards steady progress even when a big goal's bar barely moves.

**Milestones,** a second kind of goal, for one-time things ("get an internship offer"). Habit-like goals belong in Habits.
- `kind` is `progress` (the default) or `milestone`. A milestone has no target, current, unit or step.
- **On the tile:**
  - the name;
  - "by Dec 31 · 3 wk left" when it has a deadline;
  - a **Done** button (`--hit`) with the 5-second pending tap.

  There's no bar.
- **Done** sets `achieved_at` and archives the milestone.
- **Progress goals also get `achieved_at`** the first time they reach their target, and keep their ✓ until archived, as now. Together, the year in review has one list of everything achieved.

**Dreams,** for long-horizon, bucket-list things:
- They're kept as goals with `dream` set, and never shown on the tile.
- They're listed in a Dreams section on `/manage`.
- "Make it a goal" clears `dream` (a deadline can be added then).
- Claude can add them with `add_goal`.

**On the tile:** goals with the nearest deadline first (goals without one last), then oldest first. Up to 4, then "+N more", as now.

**Rejected:**
- **Goals that count themselves** (such as applications sent). Goals change too often for that to be worth it. Claude updates such goals during the nightly routine instead, by reading the applications.
- **Goals that reset each period:** that's a weekly habit.
- **Areas on goals.**

**Files:**
- **A migration:**
  - `kind`, `deadline`, `started`, `step`, `achieved_at`, `dream`;
  - `target` nullable for milestones, with a CHECK tying it to `kind`.
- `shared/schemas.js`.
- `server/stores/goals.js`:
  - `achieved_at`;
  - Done;
  - the weekly sum.
- **The Goals widget:**
  - the pace tick;
  - amber when behind;
  - the milestone row;
  - the step.
- The editors.
- The Dreams section on `/manage`.
- `describeChange.js` ("Achieved …").
- The MCP descriptions.

**Tests:**
- the pace maths and the amber threshold;
- the week's sum across `week_start`;
- a milestone's Done, and its Undo.

---

## 6. Job search

**Why:**
- Tapping the pill cycled applied → interview → offer, which had no real use, and there was no way to reject from the tile.
- The four stage counts took a third of the tile, didn't help, and could be demotivating while mass-applying.
- The posting's link was stored but never shown.
- There was no stage for online assessments.

**Statuses:** `applied`, **`oa`**, `interview`, `offer`, `rejected`, and **`withdrawn`**.
- Withdrawn is for an application you drop yourself. Luke rarely expects to use it, but it keeps "they said no" apart from "I said no".
- **Rejected and withdrawn are archived:** they never appear on the tile, not even as spare rows. They're under an "Archived" filter in the editor.

**The next step:** new fields `next_on` (a date) and `next_time` (optional).
- They mean the OA's due date, the interview's time, or the date an offer needs a reply by.
- Shown as "due Fri", "Tue 2 PM" or "reply by Oct 20", in `--urgent` within 2 days.
- Claude fills them in during the nightly routine, from email.

**The layout: a list, and a panel for the selected application**

```
 JOB SEARCH                                                        ✎
 Stripe        [interview]  Tue 2 PM │ Stripe · SWE Intern
 Jane Street   [OA]         due Fri  │ Interview · Tue Oct 6, 2:00 PM
 Ramp          [offer]   by Oct 20   │ Applied Sep 12      [Stage ▾]
 Figma         [applied]    Sep 28   │ ─────────────────────────────
 Notion        [applied]    Sep 27   │ Recruiter: Dana. Two rounds:
 + 31 more                           │ coding (LeetCode medium) and
                                     │ a project deep-dive…
                                     │             ↗ Posting  Prepare
```

- **The list (left, about 55%)** has one line per application: the company, the stage pill and the next step's date.
  - **Order:** OA, interview and offer applications first, by the next step's date. Spare rows are filled with the most recent applied ones, muted, so the tile isn't empty early in a search.
  - About 6 rows, then "+N more".
  - **No stage counts.**
- **Tapping a row selects it.** The pill is only a label, so a tap can't change a stage by accident.
- **The panel (right, about 45%)** shows the selected application:
  - the company and role;
  - the next step, with its date and time;
  - the date applied;
  - **Stage ▾;**
  - the notes, scrolling inside the panel if long;
  - **↗ Posting** and **Prepare**.
- **Default selection:** the top row, the most urgent. With no tapping at all, the wall shows the next interview or OA and its notes. On the kiosk, the selection returns to the top row after 5 minutes idle.
- **Stage ▾** opens a menu of every stage. The choice goes through the 5-second pending tap. This replaces both the cycling pill and the rule that only the editor could reject.
- **Prepare** (on OA and interview applications) opens a new claude.ai chat with the prompt filled in:
  - the company, role, stage, posting link and notes;
  - a request to look up the interview process and likely questions on the web, run a prep session, and save a short summary to the application's notes through the Dashboard connector.

  The next prep then builds on the last.
- **On the kiosk, ↗ and Prepare are hidden.** Kiosk Chromium has no tabs and no back button, so an outside page would leave the wall stuck, and the kiosk isn't signed in to claude.ai. Elsewhere they open a new tab.

**Files:**
- **A migration:** a rebuild of `applications`, since SQLite can't change a CHECK in place, with the new statuses, `next_on` and `next_time`.
- `shared/schemas.js` (`STATUSES`; `NEXT_STATUS` removed).
- **Server:**
  - the `/advance` route and its allow-list entry are removed (`set_application_status` stays);
  - `server/stores/applications.js`;
  - `server/routes/resources.js`;
  - `server/access.js`.
- **Frontend:**
  - `src/widgets/job`;
  - the shared menu component (§3);
  - the `--oa` and `--withdrawn` tokens;
  - the editors (the new fields, the Archived filter);
  - `describeChange.js`.
- **MCP:** the descriptions.

**Tests:**
- the migration;
- the list order and the spare rows;
- the stage menu with the pending tap;
- the kiosk hiding the links;
- the Prepare link's contents.

---

## 7. The change record, kept for good

The change record (`changes`) already logs every create, update and delete, with its time, who made it, and the row before and after. That covers tasks added and completed, habit checks and goal increments, which is everything a year in review needs.

- **It was pruned after a year** (`YEAR_MS` in `server/changes.js`). A review in January would already have lost last January. **It's now kept forever.**
- **Size:** likely tens of megabytes a year at most, which is fine for the VM and the backups. The `at` index keeps it fast.
- **The ✦ mark** on Claude's items keeps its own one-year limit, so marks still fade.
- A stats or "wrapped" page would read from this record. That's on the Later list (§10).

---

## 8. The dock clock: seconds

The clock already ticks every second but shows only hours and minutes.

- **It adds seconds,** smaller and muted, beside the minutes ("10:42 ³⁷"), at about 40% of the clock's size in `--text-muted`.
- **Full-size seconds were rejected:** changing every second, they would pull the eye across the room, and the clock would be about 40% wider.
- `tabular-nums` keeps the digits from jittering.

**Files:** `src/components/Dock.jsx` and its CSS.

---

## 9. Word of the day

Unchanged.

---

## 10. For later

- **A stats or "wrapped" page** (steps, a year in review): a separate page on the same server, like `/manage`, reading the change record. Not on the grid.
- **Habits derived from data** ("applied to a job today"), and polling LeetCode or GitHub.
- **Logging habits from the phone** (§2).
- **The daily briefing:** its content, and where it goes on the grid, are decided when the agent is designed.
- Recurring tasks come off DESIGN §12's Later list, since they're designed here (§3).

### Open questions

- **claude.ai's prefilled prompt.** Prepare (§6) assumes `claude.ai/new?q=…` opens a new chat with the text filled in. Check before building on it.
- **How fresh Google's secret iCal feed is** (already in DESIGN §16). It matters more now that planning is done with time blocks. Create an event and time how long it takes to appear.

---

## 11. Build order

Each step is an independent PR off `main`.

| # | PR | Size |
|---|---|---|
| 1 | Dock seconds (§8) | Small |
| 2 | The change record kept for good (§7) | Small |
| 3 | Upcoming, and the routine calendar feed (§1) | Medium |
| 4 | Habits: the weekly target and `week_start` (§2) | Medium |
| 5 | Countdown: the time, `detail`, past dates (§4) | Medium |
| 6 | Tasks data: areas, priorities, minutes, recurrence (§3) | Large |
| 7 | The Tasks and Assignments tiles: the row, sort and filter (§3) | Medium |
| 8 | Goals (§5) | Medium |
| 9 | Job search (§6) | Large |

- **Several PRs touch `shared/schemas.js`, and most add a migration,** so migration numbers are given out in merge order: a PR renames its file when it's rebased.
- **Each PR description names the other PRs touching the same files,** so they're merged in a sensible order.
- **Each PR updates DESIGN.md** (§3, §10 and the rest) to describe what it built, and the README of each directory it changes.
