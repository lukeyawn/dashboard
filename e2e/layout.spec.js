import { expect, test } from '@playwright/test';

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

    const bodySizes = [...document.querySelectorAll('.widget')]
        .map(el => parseFloat(getComputedStyle(el).fontSize));

    const smallTargets = [...document.querySelectorAll('[data-tap]')]
        .map(el => ({ label: el.textContent.trim().slice(0, 40), ...el.getBoundingClientRect().toJSON() }))
        .filter(r => r.width < 48 * px - 0.5 || r.height < 48 * px - 0.5)
        .map(r => `${r.label} (${Math.round(r.width)}×${Math.round(r.height)})`);

    return {
        pageScrolls: root.scrollWidth > root.clientWidth || root.scrollHeight > root.clientHeight,
        shells,
        dockInside: dock.top >= 0 && dock.bottom <= innerHeight + 0.5 && dock.height > 0,
        bodySizes,
        smallTargets,
    };
}

for (const [width, height] of RESOLUTIONS) {
    test.describe(`${width}×${height}`, () => {
        test.use({ viewport: { width, height } });

        test('fits the screen', async ({ page }) => {
            await page.goto('/');
            await page.locator('.dock').waitFor();
            await page.evaluate(() => document.fonts.ready);
            await page.screenshot({ path: `test-results/screens/${width}x${height}.png` });

            const m = await page.evaluate(measure);

            expect(m.pageScrolls, 'the page scrolls').toBe(false);
            expect(m.shells).toHaveLength(9);
            expect(m.shells.filter(s => s.overflowing).map(s => s.area), 'widgets whose content overflows').toEqual([]);
            expect(m.shells.filter(s => !s.inside).map(s => s.area), 'widgets off screen').toEqual([]);
            expect(m.dockInside, 'the dock is on screen').toBe(true);
            expect(m.smallTargets, 'tap targets smaller than --hit').toEqual([]);

            // body text is the same size in every widget (DESIGN §9)
            const spread = Math.max(...m.bodySizes) - Math.min(...m.bodySizes);
            expect(spread, `body sizes ${m.bodySizes.join(', ')}`).toBeLessThan(0.5);
        });
    });
}
