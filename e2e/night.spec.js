import { expect, test } from '@playwright/test';
import { FULLSTACK_URL, TEST_API_TOKEN, TEST_KIOSK_TOKEN } from '../playwright.config.js';

// Night mode, in a real browser (DESIGN §6.4). Night mode is one setting on the
// shared test server, so every test that touches it lives here and runs in order.
test.describe.configure({ mode: 'serial' });
test.use({ baseURL: FULLSTACK_URL, viewport: { width: 1920, height: 1080 }, hasTouch: true });

const asOwner = { headers: { authorization: `Bearer ${TEST_API_TOKEN}` } };

test('a tap on the dark screen wakes it without ticking the task underneath', async ({ page, request }) => {
    await page.route('https://ipapi.co/**', route => route.fulfill({ json: { latitude: 30.27, longitude: -97.74 } }));
    // no night hours, so only the moon button makes it dark, whatever the time
    await request.patch('/api/settings', { ...asOwner, data: { night_start: '04:00', night_end: '04:00' } });
    await request.post('/api/night/cancel', asOwner);
    const name = `Under the dark ${Date.now()}`;
    await request.post('/api/tasks', { ...asOwner, data: { name } });

    await page.goto(`/login?token=${TEST_KIOSK_TOKEN}`);
    const row = page.locator('.task', { hasText: name });
    await expect(row).toBeVisible();
    const box = await row.boundingBox();

    await page.getByLabel('Start night mode now').tap();
    const overlay = page.locator('.night-overlay');
    await expect(overlay).toBeVisible();

    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(overlay).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(row).not.toHaveClass(/pending/);
    await expect(row.getByRole('checkbox')).not.toBeChecked();

    // awake, the moon cancels the early start
    await page.getByLabel('Cancel night mode').tap();
    await expect.poll(async () => (await (await request.get('/api/night', asOwner)).json()).early).toBe(false);
});

test('a browser that is not the kiosk never goes dark', async ({ page, request }) => {
    await request.post('/api/night/start', asOwner);
    await page.request.post('/api/login', { data: { token: TEST_API_TOKEN } });
    await page.clock.install();
    await page.goto('/');
    await expect(page.locator('.dock')).toBeVisible();
    await page.clock.fastForward('06:00');
    await expect(page.locator('.night-overlay')).toHaveCount(0);
    await request.post('/api/night/cancel', asOwner);
});

test('/manage changes night hours and starts night mode early, on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.request.post('/api/login', { data: { token: TEST_API_TOKEN } });
    await page.goto('/manage#settings');
    const settings = page.locator('#settings');
    // the same start and end means no night hours, so this works at any time of day
    await settings.getByLabel('Night starts').fill('04:00');
    await settings.getByLabel('Night ends').fill('04:00');
    await settings.getByRole('button', { name: 'Save night hours' }).click();
    await expect.poll(async () => (await (await page.request.get('/api/settings')).json()).night_start).toBe('04:00');
    await expect(settings.getByText('Night mode is off')).toBeVisible();

    await settings.getByRole('button', { name: 'Start night now' }).click();
    await expect(settings.getByText('Night mode is on')).toBeVisible();
    await settings.getByRole('button', { name: 'Cancel early start' }).click();
    await expect(settings.getByText('Night mode is off')).toBeVisible();
});
