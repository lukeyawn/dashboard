import { expect, test } from '@playwright/test';
import { FULLSTACK_URL, TEST_API_TOKEN, TEST_KIOSK_TOKEN } from '../playwright.config.js';

// The first vertical slice against the real server and database (DESIGN §12, phase 1)
test.use({ baseURL: FULLSTACK_URL, viewport: { width: 1920, height: 1080 } });

// the kiosk looks up its location from its IP address; answer without the network
test.beforeEach(async ({ page }) => {
    await page.route('https://ipapi.co/**', route => route.fulfill({ json: { latitude: 30.27, longitude: -97.74, city: 'Austin', region_code: 'TX' } }));
});

test('asks for a token, and keeps you logged in', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Access token').fill('not-the-token');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toHaveText('That token is not right');

    await page.getByLabel('Access token').fill(TEST_API_TOKEN);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.locator('.tasks-widget')).toBeVisible();

    await page.reload();
    await expect(page.locator('.tasks-widget')).toBeVisible();
    await expect(page.getByLabel('Access token')).toHaveCount(0);
});

test('adds a task, clears it after 5 seconds, and remembers that', async ({ page, request }) => {
    await page.clock.install();
    // the kiosk's login link sets the cookie and lands on the dashboard
    await page.goto(`/login?token=${TEST_KIOSK_TOKEN}`);
    await expect(page).toHaveURL(FULLSTACK_URL + '/');

    const name = `Buy milk ${Date.now()}`;
    await page.getByLabel('New task').fill(name);
    await page.getByLabel('New task').press('Enter');
    const row = page.locator('.task', { hasText: name });
    await expect(row).toBeVisible();
    await expect(page.getByLabel('New task')).toHaveValue('');

    // a tap starts the timer, a second tap cancels it
    await row.click();
    await expect(row).toHaveClass(/pending/);
    await row.click();
    await expect(row).not.toHaveClass(/pending/);
    await page.clock.fastForward(6000);
    await expect(row).toBeVisible();

    await row.click();
    await page.clock.fastForward(5000);
    await expect(row).toHaveCount(0);

    // saved, not just hidden: the server has it as done
    const tasks = await request.get('/api/tasks', { headers: { authorization: `Bearer ${TEST_API_TOKEN}` } });
    const saved = (await tasks.json()).find(t => t.name === name);
    expect(saved.done_at).toMatch(/Z$/);

    await page.reload();
    await expect(page.locator('.tasks-widget')).toBeVisible();
    await expect(page.locator('.task', { hasText: name })).toHaveCount(0);
});

test('the kiosk reports its location, and every widget loads from the real server', async ({ page, request }) => {
    await page.goto(`/login?token=${TEST_KIOSK_TOKEN}`);
    await expect(page.locator('.dock-weather')).toContainText('75°');
    await expect(page.locator('.widget-message', { hasText: /Couldn't|Loading/ })).toHaveCount(0);

    // the server asked the kiosk for its location, and the kiosk told it
    await expect.poll(async () => {
        const res = await request.get('/api/weather', { headers: { authorization: `Bearer ${TEST_API_TOKEN}` } });
        return (await res.json()).location;
    }).toMatchObject({ name: 'Austin, TX', source: 'kiosk' });
});
