import { defineConfig, devices } from '@playwright/test';

// Browser tests (DESIGN §13). Layout checks run against `vite preview` with the
// API mocked; the full-stack tests run the real server on an in-memory database.
export const FULLSTACK_URL = 'http://localhost:4174';
export const TEST_API_TOKEN = 'e2e-api-token-0123456789abcdefghijklmnopq';
export const TEST_KIOSK_TOKEN = 'e2e-kiosk-token-0123456789abcdefghijklmno';

export default defineConfig({
    testDir: 'e2e',
    outputDir: 'test-results',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4173',
        // the fixtures are written for this time zone, like the unit tests
        timezoneId: 'America/Chicago',
    },
    webServer: [
        {
            command: 'npm run build && npm run preview -- --port 4173 --strictPort',
            url: 'http://localhost:4173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
        },
        {
            // waits for the build above, then serves dist/ like production
            command: 'until [ -f dist/index.html ]; do sleep 1; done; node e2e/server.js',
            url: `${FULLSTACK_URL}/api/health`,
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
                API_TOKEN: TEST_API_TOKEN,
                KIOSK_TOKEN: TEST_KIOSK_TOKEN,
                PORT: '4174',
            },
        },
    ],
});
