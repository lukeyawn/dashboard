// The dashboard grid, as data (DESIGN §7). This is the single source of truth:
// WidgetShell places each widget from here, its spans drive the --cell unit
// (§9), and click-to-focus will build its track lists from it later.

export const COLUMNS = 11;
export const ROWS = 5;

// col and row are inclusive [first, last] track numbers, counted from 1
export const AREAS = {
    calendar: { col: [1, 4], row: [1, 2] },
    job: { col: [5, 8], row: [1, 2] },
    goals: { col: [9, 11], row: [1, 2] },
    timeline: { col: [1, 2], row: [3, 5] },
    deadlines: { col: [3, 4], row: [3, 4] },
    wotd: { col: [3, 3], row: [5, 5] },
    countdown: { col: [4, 4], row: [5, 5] },
    tasks: { col: [5, 8], row: [3, 5] },
    habits: { col: [9, 11], row: [3, 5] },
};

export function placement(area) {
    const extent = AREAS[area];
    if (!extent) throw new Error(`Unknown layout area: ${area}`);
    const [firstCol, lastCol] = extent.col;
    const [firstRow, lastRow] = extent.row;
    return {
        gridColumn: `${firstCol} / ${lastCol + 1}`,
        gridRow: `${firstRow} / ${lastRow + 1}`,
        cols: lastCol - firstCol + 1,
        rows: lastRow - firstRow + 1,
    };
}
