# Implementation decisions

Choices made while building, where [DESIGN.md](DESIGN.md) left room or turned out to be wrong in detail. Newest last within each phase. Anything here that changes the design itself is also reflected in DESIGN.md.

## Phase 0: groundwork

| Choice | Why |
|---|---|
| Widgets are placed with `grid-column` / `grid-row` lines computed from `src/layout.js`, not a `grid-template-areas` string in CSS. | Keeps `layout.js` the single source of truth (DESIGN §7). A CSS area string would be a second copy that could drift. A unit test checks the areas tile the 11 × 5 grid exactly. |
| The `habit` area is now `habits`, and the component `HabitsWidget`. | Matches the other plural widget names (tasks, goals, deadlines). |
| Word of the day: the hanzi is `min(42cqmin, 88cqw / characters)`, pinyin and definition `13cqmin`, pinyin muted. | The old sizes (pinyin 20, hanzi 50, definition 25) overflowed the tile, and a two-character word wrapped onto two lines. The layout check caught it. The widget passes the character count as `--chars` so longer words shrink to stay on one line. |
| The "hide the title when the tile is small" container query is left out for now. | Container queries can't use custom properties, so the threshold would have to be a fixed `px` value, which breaks the any-screen rule. Only click-to-focus (later) makes tiles small enough to need it; it'll use an aspect-ratio query then. |
| The dock clock shows AM/PM at a smaller size beside the time. | Keeps the glanceable digits large without the period crowding them. |
| The 2 px stage-color line on job stage cards is `max(1px, 2 × --px)`. | It's chrome rather than content, so it scales with the page, but never drops below a visible hairline. |
| Background photo resized from 6000 × 3748 (2.7 MB) to 3840 × 2399 (0.8 MB). | Covers a 4K screen; a 6000 px image costs the Pi about 90 MB of memory to decode. |
| The superseded root design drafts moved to `docs/archive/`. | DESIGN.md replaces them, but they record how decisions were reached. |
| `src/exercises.jsx` moved to `src/scratch/` and removed from `.gitignore`. `src/scratch/` is excluded from lint. | It was tracked and ignored at the same time. Scratch code is practice, sometimes deliberately broken, and never imported. |
| Unit tests run with `TZ=America/Chicago`. | Pins the time zone so the date tests cover real clock changes (2026-03-08 and 2026-11-01) on any machine. |
| Test files opt into jsdom with a `// @vitest-environment jsdom` comment; everything else runs in Node. | Simpler than separate Vitest projects, and server tests never get browser globals by accident. |
| Date helpers are `parseDate`, `formatDate`, `today`, `addDays`, `daysBetween` and `isDateString` in `shared/dates.js`. | One set used by the frontend, server and MCP server (DESIGN §14). |
| The layout check treats any element with a `data-tap` attribute as a tap target and checks it's at least `--hit`. | Gives widgets one explicit way to opt their targets into the check. |
| Dependency review blocks copyleft licenses (GPL, AGPL, LGPL, SSPL) instead of allowing a fixed list. | An allow-list fails on harmless licenses nobody listed (font and data licenses especially). The goal is MIT compatibility, and copyleft is what breaks it. |
| The git remote uses HTTPS with `gh` as the credential helper, configured for this repo only. | The laptop's SSH key isn't registered with GitHub. |
| In WSL without `sudo`, Playwright's Chromium gets its missing libraries (`libnspr4`, `libnss3`, `libasound2`) from packages extracted into `~/.cache/playwright-libs`, used through `LD_LIBRARY_PATH`. | Lets the layout checks run locally. CI installs them normally. |
