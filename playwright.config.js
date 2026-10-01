import { defineConfig, devices } from '@playwright/test';

// Layout checks against a production build (DESIGN §13). The API is mocked per test.
export default defineConfig({
    testDir: 'e2e',
    outputDir: 'test-results',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4173',
    },
    webServer: {
        command: 'npm run build && npm run preview -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
