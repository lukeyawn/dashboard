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
    // everything in the dock fits beside the clock, the agent's ✦ included
    const dockParts = [...document.querySelectorAll('.dock-clock, .dock-center > *, .dock-right > *')].map(el => el.getBoundingClientRect());
    const dockCrowded = dockParts.some((a, i) => a.right > innerWidth || dockParts.slice(i + 1).some(b => b.left < a.right - 0.5));

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
        dockCrowded,
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
            await page.locator('.dock-agent').waitFor();
            await page.locator('.timeline-event').first().waitFor();
            await page.locator('.upcoming-event').first().waitFor();
            await page.evaluate(() => document.fonts.ready);
            // the lists that fold what doesn't fit into "+N" work it out again
            // once the fonts are in, so none is left cutting off a row
            const clipped = () => page.evaluate(() => [...document.querySelectorAll('.upcoming-body, .tasks-list, .assignment-list, .timeline, .job-list')]
                .filter(el => el.scrollHeight > el.clientHeight + 1)
                .map(el => el.className));
            await expect.poll(clipped, { message: 'lists cutting off a row' }).toEqual([]);
            await page.screenshot({ path: `test-results/screens/${width}x${height}.png` });

            const m = await page.evaluate(measure);

            expect(m.pageScrolls, 'the page scrolls').toBe(false);
            expect(m.shells).toHaveLength(9);
            expect(m.messages, 'widgets showing loading or error').toEqual([]);
            expect(m.shells.filter(s => s.overflowing).map(s => s.area), 'widgets whose content overflows').toEqual([]);
            expect(m.shells.filter(s => !s.inside).map(s => s.area), 'widgets off screen').toEqual([]);
            expect(m.dockInside, 'the dock is on screen').toBe(true);
            expect(m.dockCrowded, 'the dock\'s parts overlap or run off screen').toBe(false);
            expect(m.dayOffsets, "Upcoming's days, off their columns (reference px)").toHaveLength(4);
            expect(m.dayOffsets.filter(d => d > 8), "Upcoming's days, off their columns (reference px)").toEqual([]);
            expect(m.smallTargets, 'tap targets smaller than --hit').toEqual([]);

            // body text is the same size in every widget (DESIGN §9)
            const spread = Math.max(...m.bodySizes) - Math.min(...m.bodySizes);
            expect(spread, `body sizes ${m.bodySizes.join(', ')}`).toBeLessThan(0.5);

            // Job search with an application's panel open (docs/BLOCKS.md §6)
            // near its edge: the middle of a row may be its ↗ link
            await page.locator('.job-select').first().click({ position: { x: 4, y: 4 } });
            await page.locator('.job-panel').waitFor();
            await expect.poll(clipped, { message: 'lists cutting off a row, with the panel open' }).toEqual([]);
            await page.screenshot({ path: `test-results/screens/${width}x${height}-job-panel.png` });
            const withPanel = await page.evaluate(measure);
            expect(withPanel.shells.filter(s => s.overflowing).map(s => s.area), 'widgets whose content overflows, with the panel open').toEqual([]);
            expect(withPanel.smallTargets, 'tap targets smaller than --hit, with the panel open').toEqual([]);

            // the agent's timeline, opened from the dock's ✦ (docs/AGENT.md §7):
            // the briefings first, then the changes, which are more than fit
            await expect(page.locator('.dock-agent')).toHaveText('✦7 new');
            await page.locator('.dock-agent').click();
            const modal = page.locator('.agent-timeline');
            await modal.waitFor();
            const measureTimeline = () => modal.evaluate(el => {
                const px = Math.min(innerWidth / 1920, innerHeight / 1080);
                const rect = el.getBoundingClientRect();
                const dock = document.querySelector('.dock').getBoundingClientRect();
                const body = el.querySelector('.agent-timeline-body');
                const small = [...el.querySelectorAll('button')]
                    .map(b => ({ label: b.getAttribute('aria-label') ?? b.textContent.trim(), ...b.getBoundingClientRect().toJSON() }))
                    .filter(r => r.height < 48 * px - 0.5)
                    .map(r => r.label);
                return {
                    inside: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= dock.top,
                    scrolls: body.scrollHeight > body.clientHeight,
                    wide: body.scrollWidth > body.clientWidth + 1,
                    small,
                };
            });
            for (const tab of ['Briefings', 'Changes · 7 new']) {
                await modal.getByRole('tab', { name: tab }).click();
                await page.screenshot({ path: `test-results/screens/${width}x${height}-agent-${tab.split(' ')[0].toLowerCase()}.png` });
                const agent = await measureTimeline();
                expect(agent.inside, `the agent's ${tab} is on screen, above the dock`).toBe(true);
                expect(agent.wide, `the agent's ${tab} is wider than the popover`).toBe(false);
                expect(agent.small, `the agent's ${tab}: buttons smaller than --hit`).toEqual([]);
                await expect(modal.locator('.agent-seen-line'), `the line between new and seen, in ${tab}`).toHaveCount(1);
                if (tab !== 'Briefings') expect(agent.scrolls, "the agent's changes scroll inside the popover").toBe(true);
            }
            await modal.getByText('Done').click();
            // seen now: the ✦ stays, muted
            await expect(page.locator('.dock-agent')).toHaveText('✦');
        });
    });
}
