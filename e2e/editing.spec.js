import { expect, test } from '@playwright/test';
import { FULLSTACK_URL, TEST_API_TOKEN } from '../playwright.config.js';

// Editing through the ✎ modal and /manage, against the real server (DESIGN §6.3)
test.use({ baseURL: FULLSTACK_URL });

test.beforeEach(async ({ page }) => {
    await page.route('https://ipapi.co/**', route => route.fulfill({ json: { latitude: 30.27, longitude: -97.74 } }));
    await page.request.post('/api/login', { data: { token: TEST_API_TOKEN } });
});

test.describe('the ✎ modal', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test('adds, renames and deletes a task, in the top half of the screen', async ({ page }) => {
        const name = `Modal task ${Date.now()}`;
        await page.goto('/');
        await page.locator('.tasks-widget').getByLabel('Edit tasks').click();
        const dialog = page.getByRole('dialog', { name: 'Tasks' });
        await expect(dialog).toBeVisible();
        // the on-screen keyboard opens from the bottom, so the modal stays above it
        const box = await dialog.boundingBox();
        expect(box.y + box.height).toBeLessThanOrEqual(1080 / 2 + 1);

        await dialog.locator('summary', { hasText: 'Add a task' }).click();
        await dialog.locator('.editor-add').getByLabel('Task').fill(name);
        await dialog.getByRole('button', { name: 'Add task' }).click();
        const item = dialog.locator('.editor-item', { hasText: name });
        await expect(item).toBeVisible();
        await page.screenshot({ path: 'test-results/screens/modal-1920x1080.png' });

        await item.getByRole('button', { name: 'Edit' }).click();
        // the row is a form now, so its name is in an input rather than its text
        const form = dialog.locator('.editor-item .editor-form');
        await form.getByLabel('Task').fill(`${name} renamed`);
        await form.getByRole('button', { name: 'Save' }).click();
        await expect(dialog.locator('.editor-item', { hasText: `${name} renamed` })).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(page.locator('.task', { hasText: `${name} renamed` })).toBeVisible();

        await page.locator('.tasks-widget').getByLabel('Edit tasks').click();
        const renamed = page.getByRole('dialog').locator('.editor-item', { hasText: `${name} renamed` });
        await renamed.getByRole('button', { name: 'Delete' }).click();
        await renamed.getByRole('button', { name: 'Tap again to delete' }).click();
        await expect(renamed).toHaveCount(0);
        await page.getByLabel('Close').click();
        await expect(page.locator('.task', { hasText: name })).toHaveCount(0);
    });
});

test.describe('/manage on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('fits the width, and a deadline added there shows on the dashboard', async ({ page }) => {
        const name = `Phone deadline ${Date.now()}`;
        // due within the next two weeks, so it lands in the Due soon tile
        const due = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString('en-CA');
        await page.goto('/manage');
        for (const heading of ['Tasks and deadlines', 'Countdowns', 'Goals', 'Habits', 'Job applications', 'Settings', 'History']) {
            await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBe(0);
        await page.screenshot({ path: 'test-results/screens/manage-phone.png', fullPage: true });

        const section = page.locator('#tasks');
        await section.locator('summary', { hasText: 'Add a task' }).click();
        await section.locator('.editor-add').getByLabel('Task').fill(name);
        await section.locator('.editor-add').getByLabel('Due').fill(due);
        await section.getByRole('button', { name: 'Add task' }).click();
        await expect(section.locator('.editor-item', { hasText: name })).toBeVisible();

        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto('/');
        await expect(page.locator('.due', { hasText: name })).toBeVisible();
    });
});
