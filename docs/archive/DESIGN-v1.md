# Dashboard Design

A personal dashboard for day-to-day student life: schedule, deadlines, tasks, habits, goals and the internship search, all on one screen.

This is a living document. Each section marks what's **Decided**, what's **Proposed** (not yet agreed), and what's still **Open**. When a decision is made, move it to the Decision log at the bottom.

---

## 1. Goals

- **Decided:** Everything important for today is visible at a glance, with no scrolling and no navigation.
- **Decided:** Frosted glass panels over a photo background, dark theme, Inter font.
- **Proposed:** Updating something (ticking a task or habit, adding progress to a goal) takes one click.
- **Proposed:** Works with no backend. Data lives in the browser until we need more.
- **Open:** Who uses it, and where? Just you in a browser tab, or a new-tab page, or a second monitor, or across devices?

### Non-goals
- **Proposed:** Mobile layout (desktop only for now).
- **Open:** Multiple users or accounts?

---

## 2. Layout

**Decided:** An 11 × 5 grid of named areas with a fixed 11:5 aspect ratio, and a dock below it that fills the rest of the height.

```
┌────────────────┬────────────────┬────────────┐
│    calendar    │      job       │   goals    │
│     (4×2)      │     (4×2)      │   (3×2)    │
├───────┬────────┼────────────────┼────────────┤
│       │deadlns │                │            │
│timelne│ (2×2)  │     tasks      │   habit    │
│ (2×3) ├───┬────┤     (4×3)      │   (3×3)    │
│       │wot│cdwn│                │            │
└───────┴───┴────┴────────────────┴────────────┘
┌──────────────────────── dock ────────────────┐
│ date · time                          weather │
└──────────────────────────────────────────────┘
```

- **Decided:** Gaps are `1.25vw`, and each widget sits in a `WidgetShell` placed by `gridArea`.
- **Known issue:** On short screens (for example a 1366×768 laptop), the fixed aspect ratio squeezes the dock to almost no height.
- **Open:** How to fix short screens: cap the dashboard height, size the grid from the window height, or accept it?
- **Open:** Is this the final set of widgets? Anything to add, remove or resize?

---

## 3. Visual language

### Sizing
- **Decided:** Text is sized in `vw`, so it looks the same in every widget.
- **Decided:** Large display numbers (countdown, word of the day) are sized in `cqw` so they grow with their widget.

| Role | Size |
|---|---|
| Widget title (uppercase label) | `0.7vw` |
| Body text | `0.95vw` |
| Secondary text (dates, counts) | `0.7–0.75vw` |
| Widget padding | `0.6vw` |

### Color tokens (`:root` in `styles.css`)

| Token | Use |
|---|---|
| `--accent` (cyan) | Today, current item, progress, completed |
| `--text-muted` | Labels, secondary text |
| `--hairline` | Dividers between list rows |
| `--urgent` (red) | Deadlines within 2 days |
| `--applied` / `--interview` / `--offer` / `--rejected` | Job stage colors |

- **Open:** Should the accent color be picked to match the background photo?
- **Open:** Should the background image be swappable, and if so, should the accent change with it?

---

## 4. Widgets

Every widget is currently static: it displays whatever sample data it's given as props.

### Calendar (4×2)
- **Shows:** Today's weekday, date and month on the left; the month grid on the right with today circled.
- **Data:** None yet (uses the current date).
- **Open:** Should days with events or deadlines get a dot? Can you move to the previous or next month?

### Job search (4×2)
- **Shows:** A count per stage, plus the 3 newest applications with a status label.
- **Data:** `{id, company, role, status: 'applied' | 'interview' | 'offer' | 'rejected'}[]`
- **Proposed:** Clicking a status label moves the application to the next stage.
- **Open:** Is this tracker what "job" should mean? Should each application also store a date applied, a link and notes?

### Goals (3×2)
- **Shows:** A progress bar for each goal.
- **Data:** `{id, name, current, target, unit?}[]`
- **Proposed:** A +1 button on each goal.
- **Open:** Should goals have a time frame (weekly, semester, year)? What happens to finished goals?

### Habits (3×3)
- **Shows:** A row of dots per habit for the last 7 days, plus the current streak.
- **Data today:** `{id, name, days: boolean[7]}[]`. This only makes sense on the day it was written.
- **Proposed:** Change it to `{id, name, done: string[]}`, a list of ISO dates, and work out the last 7 days from today. Clicking today's dot toggles it.
- **Open:** Are all habits daily, or can some be weekly (for example "3× per week")?

### Timeline (2×3)
- **Shows:** Today's events on a vertical line. Past events are dimmed and the current one is highlighted.
- **Data:** `{id, time: "HH:MM", title}[]`
- **Open:** Where events come from: entered by hand, a Google Calendar sync, or an `.ics` feed? (See §6.)
- **Open:** Should events have an end time or a location? What happens when there are too many to fit?

### Deadlines (2×2)
- **Shows:** Deadlines sorted by due date with labels like "tomorrow" or "3 days". Ones due within 2 days turn red.
- **Data:** `{id, name, due: "YYYY-MM-DD"}[]`
- **Open:** Should each deadline have a course or category? Should overdue items stay until dismissed? Should deadlines link to tasks?

### Tasks (4×3)
- **Shows:** A to-do list with checkboxes.
- **Data:** `{id, name, done}[]`
- **Known issue:** `toggleTask` isn't defined yet.
- **Open:** Are tasks for today only, or ongoing? What happens to finished tasks (hide, cross out, clear each day)?

### Word of the day (1×1)
- **Shows:** Pinyin, the word, and its definition.
- **Proposed:** A bundled JSON word list, with one chosen by the day number.
- **Open:** Which word list (HSK level?), and should it include an example sentence?

### Countdown (1×1)
- **Shows:** The number of days or weeks until an event.
- **Proposed:** Give it a target date and work out the number, instead of hardcoding it.
- **Open:** Only one countdown, or rotate through several?

### Dock
- **Shows:** Date and time on the left, weather on the right.
- **Proposed:** A live clock, and weather from Open-Meteo (no API key needed).
- **Open:** Anything else for the dock, such as a quick-add box or a music player?

---

## 5. State and data flow

- **Proposed:** A single `useNow()` hook in `App` that updates every 30–60 seconds. Its value is passed to every widget that depends on the time (dock, calendar, timeline, deadlines, countdown, habits).
- **Proposed:** One custom hook per kind of data in `src/hooks/` (`useTasks`, `useHabits`, `useGoals`, `useDeadlines`, `useApplications`), each built on a shared `useLocalStorage(key, initial)`.
- **Proposed:** `App` only arranges the widgets. Widgets receive data and callback props (`onToggle`, `onAdd`, …) and don't read storage themselves.
- **Proposed:** No Context or Redux unless passing props down gets painful.
- **Open:** Is localStorage enough, or do we want the data on several devices (which would need a backend)?

---

## 6. External data

| Source | Feeds | Difficulty | Status |
|---|---|---|---|
| Open-Meteo | Dock weather | Easy, no key | Proposed |
| Bundled word list (JSON) | Word of the day | Easy | Proposed |
| Google Calendar API | Timeline, calendar | Hard (OAuth) | Open |
| `.ics` feed | Timeline, calendar | Medium | Open |
| Canvas API | Deadlines | Medium | Open, stretch goal |

- **Open:** Is Google Calendar sync essential for version 1, or a stretch goal?

---

## 7. Editing

- **Proposed:** An edit (✎) button on each widget switches it into edit mode, with a small form plus delete buttons.
- **Proposed:** Simple changes happen with a click right on the widget (habit dots, task checkboxes, +1 on goals, job stages).
- **Open:** Edit mode inside each widget, or one shared pop-up form?

---

## 8. Roadmap

0. **Save the current state:** commit, and move the sample data into `src/data/`.
1. **Make it live:** `useNow()`, the live clock, working tasks, the countdown worked out from a date.
2. **Keep data:** `useLocalStorage`, the per-topic hooks, the new habit data format.
3. **Editing:** edit mode for each widget, one-click updates.
4. **Real data:** weather, word list, calendar source.
5. **Polish:** short screens, empty/loading/error states, hover and focus styles, deployment.

- **Open:** Who writes what in each phase?

---

## Decision log

| Date | Decision |
|---|---|
| 2026-09 | 11 × 5 named-area grid, frosted glass panels, dark theme, Inter font |
| 2026-09 | Text sized in `vw`; large display numbers sized in `cqw` |
| 2026-09-30 | Built static versions of the calendar, job, goals, habit, timeline and deadlines widgets, plus shared color tokens |
