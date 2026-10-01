import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    // src/scratch is practice code, never imported by the app (DESIGN §2)
    globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results', 'src/scratch']),
    {
        files: ['src/**/*.{js,jsx}'],
        extends: [
            js.configs.recommended,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            // __BUILD__ is the commit the page was built from (vite.config.js)
            globals: { ...globals.browser, __BUILD__: 'readonly' },
            parserOptions: { ecmaFeatures: { jsx: true } },
        },
    },
    {
        files: ['server/**/*.js', 'mcp/**/*.js', 'shared/**/*.js', 'kiosk/**/*.js', 'vm/**/*.js', 'scripts/**/*.js', '*.config.js'],
        extends: [js.configs.recommended],
        languageOptions: { globals: globals.node },
    },
    {
        // Playwright specs run in Node, but the functions they pass to page.evaluate run in the browser
        files: ['e2e/**/*.js'],
        extends: [js.configs.recommended],
        languageOptions: { globals: { ...globals.node, ...globals.browser } },
    },
    {
        files: ['**/*.test.{js,jsx}'],
        rules: { 'react-refresh/only-export-components': 'off' },
    },
]);
