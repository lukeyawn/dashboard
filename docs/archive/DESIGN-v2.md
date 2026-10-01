# Personal Dashboard — UI Design Decisions & Build Spec

Sep 30, 2026 · @Luke

## How to use this doc

This records the UI and architecture decisions made while building the dashboard's frontend, so an AI collaborator can pick up the work without re-deriving or re-litigating them.

Treat everything under "Settled" as fixed. Where a decision has a stated reason, the reason matters more than the rule — it's what tells you whether a new situation is covered by it. Open questions are collected at the end; those are the only places a judgment call is still wanted.

The owner is a CS + math student who learned HTML, CSS, JS, and React over roughly two weeks specifically to build this. The owner directs design and reviews output rather than writing the code. The decisions recorded here were reached by building and hitting the problems, not assumed — several were fixed only after an AI's first explanation turned out to be wrong.

## Project context

A local, self-owned, Notion-style life dashboard, eventually displayed on a wall-mounted Raspberry Pi kiosk. Not a note-taking app — Obsidian stays for math notes.

Priorities, in order: own the data (no proprietary format lock-in), stay readable in ten years, avoid Obsidian's plugin-hell problem by building features natively, portfolio value.

**Stack:** React (Vite) + plain CSS, Node/Express or FastAPI + SQLite, markdown files for genuinely long-form content only. Running under WSL2 with the project inside the Linux filesystem.

Settled earlier and not to be reopened:

- SQLite for structured data + markdown files for long-form prose. Rule of thumb: short structured fields → a table row; paragraphs of prose → a file, with SQLite as an index.
- Plain CSS, not Tailwind. Tailwind was in the original notes but an AI made that call, not the owner. Deferred deliberately to build confidence in CSS first. Design tokens are kept as custom properties and CSS is split per component, both of which map cleanly onto Tailwind later if that changes.
- No generic plugin system and no schema-agnostic database engine. There is one developer; arbitrary third-party extensibility is not a goal.
- No custom drag-and-drop kanban. Would outsource to GitHub Projects or Trello if ever genuinely needed.
- No rich text editor from scratch. Would use Tiptap, Lexical, or CodeMirror.
- Generic schemas over per-feature ones — one `countdowns` table, not one table per event.

## Page structure and layout

The page is a flex column holding two children: the grid, sized by `aspect-ratio`, and the dock, which takes the remainder with `flex-grow: 1`. Grid and Flexbox are composed deliberately, each where it suits.

**Grid resolution is 11 columns × 5 rows**, chosen so `aspect-ratio: 11/5` on the grid container makes every cell square while leaving about 10.8% of screen width as height for the dock. On 1920×1080 that's roughly 873px of grid and 207px of dock.

A sidebar layout and a uniform tile field were both rejected. Sidebars solve a navigation problem that doesn't exist on a wall kiosk where nothing is ever hidden. Instead the grid uses tiers of visual priority rather than categories: constantly-needed widgets (tasks, goals, timeline), occasional ones (calendar, tracker), and ambient ones (countdown, birthdays, weather, word-of-day).

**Placement is assigned from outside, never by the widget.** `Dashboard` passes an `area` prop to `WidgetShell`, which applies `style={{ gridArea: area }}`. Widgets know nothing about the grid. A component shouldn't encode facts about the world outside itself.

Current area string, implemented and verified — every named region is a valid rectangle:

```
"calendar calendar calendar  calendar  job   job   job   job   goals goals goals"
"calendar calendar calendar  calendar  job   job   job   job   goals goals goals"
"timeline timeline deadlines deadlines tasks tasks tasks tasks habit habit habit"
"timeline timeline deadlines deadlines tasks tasks tasks tasks habit habit habit"
"timeline timeline wotd      countdown tasks tasks tasks tasks habit habit habit"
```

### The height chain

This caused a real bug worth recording. For the dock's `flex-grow` to have anything to grow into, every ancestor needs a defined height — and Vite's default `#root` div has none, which silently breaks the chain.

- `html`, `body`, `#root`, and `.page` all need `height: 100%`. `#root` is the one easily missed.
- `.page` uses `height: 100%`, **not** `100vh`. `100vh` ignores `body`'s padding and overshoots, producing a gap or overflow at the bottom.
- Edge inset comes from `padding` on `body` with `box-sizing: border-box`, not `margin`. Margin sits outside the box, so on a fixed-height element it pushes past the viewport instead of carving space out.

Widget count is going from twelve panels to nine, because twelve is too many to differentiate at a distance. Calendar, birthdays, and countdown merge into one date panel; heatmap and habit-entry merge as two views of one dataset. Anything with complex unique functionality stays separate.

## Visual design

The dashboard moved from a bright photo background with dark text to a **dark, low-contrast night photo with near-white text**. The previous background had a blown-out sun that no CSS filter fully recovered.

### Current widget shell — settled

```css
.widget-shell, .dock {
  container-type: inline-size;
  border: 1px solid hsla(0, 0%, 70%, 0.3);
  backdrop-filter: blur(15px);
  background-color: hsla(0, 0%, 50%, 0.1);
  box-shadow: inset 0px 0px 20px hsla(0, 0%, 80%, 0.4);
  padding: 5px;
  border-radius: 1.5cqw;
}
```

The mechanism here is worth understanding before changing any value. The panel is **very low opacity with zero hue** — it doesn't impose its own color, it lets the photo through almost unfiltered. Separation comes from heavy blur (15px, up from an earlier 5px) plus the inset white glow, not from the panel being a distinctly different color.

That inset `box-shadow` is doing most of the work. It was the change that made panels clearly readable from across the room, and it also separates adjacent panels from each other where their fills are nearly identical.

### What was tried and rejected

**Darkening the panel fill without a tint.** Looks dull and gray. Pure grayscale darkening strips the hue, and a panel with no color relationship to its surroundings reads as an unstyled placeholder regardless of how correct its lightness is. If this is revisited, keep hue and saturation and lower only lightness — don't drift to neutral.

**The Windows-11 reference approach.** The original inspiration image uses near-opaque dark slate panels, flat fill with no gradient sheen, hairline borders, and color coming from accents inside each widget rather than panel tint. This is a coherent design and is what the notes originally aimed at, but the current low-opacity approach was tested at viewing distance and works, so it was kept. Don't convert to dark slate without a reason.

**The old light-background styling.** The earlier shell used a diagonal `linear-gradient` between light grays, a visible `hsla(0, 0%, 80%, 0.5)` border, and near-black text with a white `text-shadow` for an embossed lift. All of that was tuned for a bright background and has been removed. The text-shadow in particular was dropped entirely rather than inverted — text now sits flat on the panel.

**Josh Comeau's SVG-masked gradual-blur technique.** Not needed. That's for blur that ramps across an element, like a sticky header. For uniform blur, `border-radius` + `overflow: hidden` + `backdrop-filter` on the element itself is enough.

### Widget titles

A widget gets a title only if removing it would make the content ambiguous. Countdown and weather are self-labelling; tasks and goals are not. Titles are small, muted, top-left, never competing with the data. Title visibility is a function of the tile's own size and collapses below a threshold — a container-query decision, not a media query.

## Typography

**Inter**, loaded from Google Fonts. Chosen over IBM Plex Sans, Source Sans 3, Public Sans, and Manrope for screen legibility and because it closely matches the Windows-11 reference. The font was the single biggest visual improvement in the session — the dashboard was on browser-default serif before.

Loaded with a `<link>` in `index.html`'s `<head>` (the real HTML file at the project root, not JSX), with `display=swap` so the fallback shows immediately rather than invisible text. Only the weights actually used are requested — each checked weight is a separate download. `font-family` is set once on `body` with a fallback stack and inherits everywhere:

```css
body {
  color: white;
  font-family: "Inter", -apple-system, system-ui, sans-serif;
}
```

The fallback stack matters more than usual here: the kiosk may boot before the network is up.

### Line-height on large glyphs

Any large anchor-role glyph gets `line-height: 1`. This came up twice and fixed it both times — first on the countdown number, then on the Chinese character.

The cause with CJK specifically: fonts define their own internal em-box metrics, and Chinese characters are drawn to fill nearly the whole square em, while Latin lowercase occupies only the x-height band. So `你好` at a given `font-size` is visually much taller than Latin text at the same declared size, and any inherited `line-height` above 1 adds padding on top of an already-large box.

Rule: when a large glyph takes more vertical space than expected, check `line-height` before touching `font-size`.

One untested thing — Inter has no CJK glyphs, so `你好` currently falls through to whatever the OS default CJK font is. If the character's metrics ever need controlling, set an explicit CJK family (e.g. Noto Sans SC) on that element.

## Sizing units

Content inside widgets is sized in `cqw`, not `vw`. The reason is specific and forward-looking: the planned focus interaction shrinks sibling tiles while the viewport doesn't change at all. Anything sized in `vw` would stay frozen at its current absolute size while its container shrinks around it. `cqw` is keyed to the widget's own box, so it survives that case.

This only works because `WidgetShell` sets `container-type: inline-size`. Content inside a shell can query it.

### The container-query rule, and the bug it creates

`container-type` makes an element queryable by its **descendants**, never by itself. A `cq*` unit used in the container's own rules skips past it and resolves against the next container up, or the viewport if there is none.

`border-radius: 1.5cqw` on `.widget-shell` is currently doing exactly that — it's measuring the viewport, not the shell. It works today only because the grid happens to be viewport-sized, and it will be wrong once the focus interaction shrinks a tile. **This is unresolved.** Fixes are either an inner wrapper that queries the shell, or a radius unit that doesn't pretend to be container-relative.

### Why border-radius is relative at all

It was originally `15px`. At small window sizes the corners ate the box from both sides until the straight edges disappeared and panels rendered as ellipses. An absolute radius doesn't know how big the box it's rounding is. `border-radius: 20%` was considered and rejected because percentages resolve per-axis and distort at uneven aspect ratios.

### Zoom behavior — known, not fixed

Text shrinks when the browser zooms in. This is inherent to `cqw`: container size is a rendered size, and zoom changes what fits in the viewport, which changes the grid's computed width, which changes the container. `rem` doesn't have this problem, which is why it's the accessibility-safe unit.

Not worth fixing for a kiosk that will never be zoomed. If it ever matters, the fix is `clamp()` with a `rem` floor and ceiling around a `cqw` middle term, e.g. `clamp(0.8rem, 4cqw, 2rem)` — which also retires magic numbers.

### Grid track minimums

Tracks use `minmax(0, 1fr)`, not bare `1fr`, and items get `min-height: 0` / `min-width: 0` where needed. A bare `1fr` is shorthand for `minmax(auto, 1fr)`, and that `auto` minimum lets content inflate a track past its fair share — which previously broke the grid's squareness. Flexbox has the identical trap. Also note `min-height: auto` overrides `aspect-ratio`, which is why `.dashboard` sets `min-height: 0` explicitly.

## Widgets

Build approach: **all static displays first, interactivity second.** Rendering every widget statically before wiring any of them up avoids context-switching between layout work and state work.

| Widget | Status | Data shape |
| --- | --- | --- |
| Countdown | Rendering, static props | `{ id, label, target_date, created_at }` |
| Word of the day | Rendering, static props | `{ id, hanzi, pinyin, definition }` |
| Tasks | Rendering a list, no interactivity | `{ id, name, done }` |
| Calendar, job, goals, habit, timeline, deadlines | Empty shells | — |

### Countdown

Generic `countdowns` table so birthdays, finals, and other events reuse the same schema. `GET /api/countdowns` returns all rows; the frontend does the date math. `daysUntil()` must zero out time-of-day with `setHours(0,0,0,0)` to avoid off-by-one flicker.

Chosen as the first build deliberately — almost pure logic and plumbing with minimal rendering complexity, a good end-to-end rehearsal of schema → API → fetch → render.

### Word of the day

Pinyin on top, hanzi as the large anchor in the middle, definition below. Flex column, centered on both axes. The interesting logic is picking the day's word: use day-of-year modulo the list length so it's deterministic and rotates daily without storing which word was shown when. That derivation belongs inside the widget.

Two untested cases: a single-character word (only two-character words have been seen), and a long definition that would wrap.

### Tasks

**Not a `<table>`.** Tables are for data where a column means the same thing across every row. This is a list of items with internal structure — `<ul>`/`<li>` is correct. Tables also bring their own column-width negotiation that fights irregular rows.

No flexbox inside rows. Tags were dropped from the design (the owner doesn't find tagging useful), which removed the competing elements that would have justified a flex row. A checkbox and a text label sit side by side naturally.

Checkbox and label pair via `id` / `htmlFor` so clicking the text toggles the task, not just the small box. This matters for a wall-mounted display.

```jsx
<li key={task.id}>
  <input
    type="checkbox"
    id={`task-${task.id}`}
    checked={task.done}
    onChange={() => toggleTask(task.id)}
  />
  <label htmlFor={`task-${task.id}`}>{task.name}</label>
</li>
```

Use `checked` + `onChange`, not `onClick` — this is a controlled input, driven by React state rather than the browser's own checkbox state.

Recurring auto-generated tasks (laundry, rent) are a separate, harder widget. Don't scope-creep them in here. The design principle behind them: no "I'll do X on day Y" scheduling — if it's on the list, just get it done.

## React and data architecture

**Widgets own their data-fetching.** A widget knows it needs task data and asks for it. Widgets do not own the backend — the line is the HTTP request.

**Deriving values is the widget's job too.** `daysUntil(target_date)` lives in the countdown widget. Deriving it in the parent means the parent has to know why, and the value goes stale overnight.

**State lives at the lowest level that covers everyone who needs it.** Inside the widget if only it cares; in a common parent if siblings do. "Which widget is focused" belongs to `Dashboard`. Task completion belongs to `TasksWidget` — no sibling needs it yet. The Focus widget will eventually need task data, but that's a future refactor, not a reason to lift state now.

**Frontend first, backend later, mock data in between.** The API shape should fall out of what the widget asked for, not the other way round. Keep the same async function signature so swapping in `fetch` touches one line. Mock data mirrors the real schema — use `id`, not ad-hoc keys — and should include empty and failing cases deliberately, since mock data is otherwise always instant, well-formed, and present.

**Don't extract shared components before the repetition exists.** Rule of three. Several widgets will share list-like rendering (tasks, deadlines, wins log); resist a generic `ListWidget` until the duplication is concrete rather than assumed. `WidgetShell` is the exception and earns its keep partly because container queries need an ancestor to query.

**File structure.** Flat `components/` until roughly 8–10 files, then split. `lib/` or `utils/` for non-component code from the start. Colocate by feature, not by kind. Scratch components live in `src/scratch/` and are committed, not gitignored — an ignored folder that `App` imports from means a fresh clone won't build.

### State update patterns

Updating one item in an array of objects means replacing, never mutating. React detects a new array reference; it cannot detect a mutation.

```jsx
setTasks(prev =>
  prev.map(t => t.id === taskId ? { ...t, done: !t.done } : t)
);
```

Use the updater form whenever the new value derives from the old, and always when the update fires later than the render that created it. Filtering is derived at render time (`tasks.filter(t => !t.done)`) and never needs its own state.

### Effects

Fetch on mount goes in `useEffect` with `[]`. The effect callback cannot be `async` — it must return either nothing or a cleanup function, and an `async` function always returns a Promise. Declare an `async` function inside the effect and call it.

`fetch` only rejects on network failure. A 404 or 500 is a successful fetch, so check `response.ok` explicitly. Every fetch-backed widget has three states: loading, error, and data. Loading must be its own state — an empty array can't distinguish "still fetching" from "genuinely empty", and showing "No tasks" during a fetch is a lie.

Anything that leaves something running needs a cleanup function: intervals, timeouts, `addEventListener`, subscriptions, observers. React calls cleanup on unmount and before re-running the effect. The dock's clock is the first real case:

```jsx
useEffect(() => {
  const id = setInterval(() => setNow(new Date()), 1000);
  return () => clearInterval(id);
}, []);
```

Declare the timer id with `const` inside the effect so each run's cleanup closes over its own id. One effect per concern, not one effect doing everything — each needs its own dependency array.

## Open questions

These are genuinely undecided. Everything else in this doc is settled.

- [ ] **`border-radius: 1.5cqw` on `.widget-shell` resolves against the viewport, not the shell.** Works today by coincidence; breaks when the focus interaction shrinks a tile. Needs either an inner wrapper that queries the shell, or a different unit.
- [ ] **Merged date panel structure.** Calendar + birthdays + countdown are merging. Three stacked sections, or birthdays and countdowns rendered as markers inside the calendar? Leaning stacked sections.
- [ ] **`UNASSIGNED` in the older area string** — deliberate negative space or leftover? The current 11×5 string has no gaps, so this may already be moot.
- [ ] **Where the Chinese word list lives** — hardcoded array in the component, or a separate data file. Deferred while the layout was settled; a five-minute swap either way.
- [ ] **Empty panels read as voids.** Six shells currently render nothing. May resolve itself once populated; otherwise either merge them per the consolidation plan or shrink the grid.
- [ ] **Single-character hanzi and long definitions** are untested in the word-of-day layout.

### Designed but not built

The click-to-focus interaction (click a tile, it grows, siblings shrink and condense) is fully designed and documented in the earlier handoff, but no code exists. Key points: state lives on `Dashboard`; growth comes from interpolating `grid-template-columns` / `grid-template-rows` between two `fr` lists with matching track counts, which animates smoothly — animating `grid-template-areas` or `grid-column: span` does not. Each area's row/column extents should be stored as data and the track strings generated in JS, rather than hand-writing eleven CSS rules. Sibling condensing is each widget's own job via container queries, not the grid's.

This interaction is the reason several decisions in this doc lean on `cqw` over `vw`. Don't undo those on the grounds that the viewport works fine today.

## Build plan

The original estimate was 6–8 weeks at 3–4 hrs/day for a working v1. The current target is one week, which is a 6–8x compression — so scope is cut, not schedule.

**What one week can realistically produce:** the dock clock ticking live, the tasks widget fully interactive, three or four more simple widgets rendering real content, a minimal backend with one or two tables, and one widget wired end to end. Not nine panels, no calendar sync, no heatmap, no kiosk features.

**The thing to protect: one complete vertical slice before any breadth.** A dashboard with three real widgets and a real database is a portfolio project. Nine shells on mock data is not, and a compressed timeline pushes toward exactly that failure mode.

Ordering:

1. Tasks widget fully working on mock data — checkbox toggles, completed items filter out. Dock clock the same day; it's short and it's the first real effect with cleanup.
2. Backend. One `tasks` table, `GET /api/tasks`, `PATCH /api/tasks/:id`. Wire the tasks widget to it and delete the mock array. This sits before the easy work because it's the step most likely to overrun — the first endpoint is slow, the rest are copy-paste.
3. More widgets, now that the schema → endpoint → fetch → render pattern is proven. Countdowns and a wins log reuse it directly; word-of-day needs no backend.
4. Fix what's visibly broken and make one pass on the remaining empty shells.

The backend is the real risk in this timeline, not React. Budget generously for the first endpoint.

### Out of scope

Kiosk-specific features (sunrise gradient, idle photo-album mode, the focus animation, container-query condensing) are phase 2+. The hardware plan is settled — a 32" IPS panel with wide viewing angles, side-mounted and angled toward the desk chair at seated eye height — but none of it is on the critical path. An open-ended tail is the intended shape of this project, not a failure.
