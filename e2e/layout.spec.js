import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures/api.js';

// The dashboard has to work on any landscape screen (DESIGN §7, §13).
const RESOLUTIONS = [
    [1024, 768],
    [1280, 720],
    [1366, 768],
    [1920, 1080],
    [1920, 1200],
    [2560, 1080],
    [2560, 1440],
    [3840, 2160],
];

// Measures the page in the browser. Kept free of outside variables, because it runs there.
function measure() {
    const px = Math.min(innerWidth / 1920, innerHeight / 1080);
    const root = document.documentElement;
    const overflows = el => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;

    const shells = [...document.querySelectorAll('.widget-shell')].map(shell => {
        const rect = shell.getBoundingClientRect();
        return {
            area: shell.dataset.area,
            overflowing: overflows(shell) || overflows(shell.firstElementChild),
            inside: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        };
    });

    const dock = document.querySelector('.dock').getBoundingClientRect();

    // Upcoming's day boxes line up with the grid's first 4 columns (docs/BLOCKS.md §1):
    // how far, in reference pixels, each box's edges are from its column's
    const grid = document.querySelector('.dashboard');
    const gridLeft = grid.getBoundingClientRect().left + parseFloat(getComputedStyle(grid).paddingLeft);
    const tracks = getComputedStyle(grid).gridTemplateColumns.split(' ').map(parseFloat);
    const gap = parseFloat(getComputedStyle(grid).columnGap);
    const dayOffsets = [...document.querySelectorAll('.upcoming-day')].map((box, i) => {
        const left = gridLeft + tracks.slice(0, i).reduce((sum, w) => sum + w + gap, 0);
        const rect = box.getBoundingClientRect();
        return Math.round(Math.max(Math.abs(rect.left - left), Math.abs(rect.right - (left + tracks[i]))) / px);
    });

    const bodySizes = [...document.querySelectorAll('.widget')]
        .map(el => parseFloat(getComputedStyle(el).fontSize));

    // habit day cells are allowed 0.92 of the width, so seven fit (DESIGN §6.1)
    const hit = 48 * px - 0.5;
    const smallTargets = [...document.querySelectorAll('[data-tap]')]
        .map(el => ({ label: el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 40), narrow: el.dataset.tap === 'narrow', ...el.getBoundingClientRect().toJSON() }))
        .filter(r => r.width < (r.narrow ? 0.92 * 48 * px - 0.5 : hit) || r.height < hit)
        .map(r => `${r.label} (${Math.round(r.width)}×${Math.round(r.height)})`);

    // every widget should have data from the fixtures, not a loading or error message
    const messages = [...document.querySelectorAll('.widget-message, .widget-notice')]
        .map(el => el.textContent)
        .filter(text => /Loading|Couldn't/.test(text));

    return {
        messages,
        pageScrolls: root.scrollWidth > root.clientWidth || root.scrollHeight > root.clientHeight,
        shells,
        dockInside: dock.top >= 0 && dock.bottom <= innerHeight + 0.5 && dock.height > 0,
        dayOffsets,
        bodySizes,
        smallTargets,
    };
}

for (const [width, height] of RESOLUTIONS) {
    test.describe(`${width}×${height}`, () => {
        test.use({ viewport: { width, height } });

        test('fits the screen', async ({ page }) => {
            await mockApi(page);
            await page.goto('/');
            await page.locator('.task').first().waitFor();
            await page.locator('.dock-weather').waitFor();
            await page.locator('.timeline-event').first().waitFor();
            await page.locator('.upcoming-event').first().waitFor();
            await page.evaluate(() => document.fonts.ready);
            await page.screenshot({ path: `test-results/screens/${width}x${height}.png` });

            const m = await page.evaluate(measure);

            expect(m.pageScrolls, 'the page scrolls').toBe(false);
            expect(m.shells).toHaveLength(9);
            expect(m.messages, 'widgets showing loading or error').toEqual([]);
            expect(m.shells.filter(s => s.overflowing).map(s => s.area), 'widgets whose content overflows').toEqual([]);
            expect(m.shells.filter(s => !s.inside).map(s => s.area), 'widgets off screen').toEqual([]);
            expect(m.dockInside, 'the dock is on screen').toBe(true);
            expect(m.dayOffsets, "Upcoming's days, off their columns (reference px)").toHaveLength(4);
            expect(m.dayOffsets.filter(d => d > 8), "Upcoming's days, off their columns (reference px)").toEqual([]);
            expect(m.smallTargets, 'tap targets smaller than --hit').toEqual([]);

            // body text is the same size in every widget (DESIGN §9)
            const spread = Math.max(...m.bodySizes) - Math.min(...m.bodySizes);
            expect(spread, `body sizes ${m.bodySizes.join(', ')}`).toBeLessThan(0.5);
        });
    });
}
