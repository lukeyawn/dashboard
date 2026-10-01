import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    // the commit being built, which the page compares with the server's X-Build (DESIGN §6.4)
    define: { __BUILD__: JSON.stringify(process.env.BUILD ?? 'dev') },
    server: {
        // Express runs on 3001 in development (DESIGN §2)
        proxy: { '/api': 'http://localhost:3001' },
    },
    test: {
        // tests run in Node unless a file asks for jsdom with `// @vitest-environment jsdom`
        include: ['{src,server,shared,mcp}/**/*.test.{js,jsx}'],
        setupFiles: ['src/testing/setup.js'],
        coverage: {
            provider: 'v8',
            include: ['server/**/*.js', 'shared/**/*.js', 'mcp/**/*.js', 'src/lib/**/*.js', 'src/hooks/**/*.js'],
            exclude: ['**/*.test.{js,jsx}', 'server/index.js', 'server/seed.js', 'mcp/index.js'],
            // DESIGN §13: CI fails below these
            thresholds: { lines: 90, branches: 85 },
        },
    },
});
