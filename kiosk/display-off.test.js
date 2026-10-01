// kiosk/display-off-if-night.sh, run for real against a test server, with a
// fake wlopm that records whether it would have turned the display off.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { KIOSK_TOKEN, startServer } from '../server/testing.js';

const SCRIPT = new URL('./display-off-if-night.sh', import.meta.url).pathname;
let home;
let server;

afterEach(async () => {
    await server?.close();
    server = null;
    fs.rmSync(home, { recursive: true, force: true });
});

function setUp(url, token = KIOSK_TOKEN) {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-'));
    fs.mkdirSync(path.join(home, '.config/dashboard'), { recursive: true });
    fs.mkdirSync(path.join(home, 'bin'));
    fs.writeFileSync(path.join(home, '.config/dashboard/kiosk.env'), `DASHBOARD_URL=${url}\n`);
    fs.writeFileSync(path.join(home, '.config/dashboard/kiosk-token'), token);
    fs.writeFileSync(path.join(home, 'bin/wlopm'), `#!/bin/sh\necho "$@" >> "${home}/wlopm.log"\n`, { mode: 0o755 });
}

// async, so the test server in this same process can answer the script
async function run(now) {
    await promisify(execFile)('bash', [SCRIPT], {
        env: { HOME: home, PATH: `${home}/bin:${process.env.PATH}`, ...(now && { DASHBOARD_NOW: now }) },
    });
    const log = path.join(home, 'wlopm.log');
    return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim() : null;
}

describe('display-off-if-night.sh', () => {
    it('turns the display off when the server says it is night', async () => {
        server = await startServer({ now: () => new Date(2026, 8, 30, 23, 0).getTime() });
        setUp(server.url);
        expect(await run()).toBe('--off *');
        expect(fs.readFileSync(path.join(home, '.cache/dashboard-night.json'), 'utf8')).toContain('"start":"22:00"');
    });

    it('leaves it on by day', async () => {
        server = await startServer({ now: () => new Date(2026, 8, 30, 12, 0).getTime() });
        setUp(server.url);
        expect(await run()).toBeNull();
    });

    it('judges from the saved night hours when the server cannot be reached', async () => {
        server = await startServer({ now: () => new Date(2026, 8, 30, 12, 0).getTime() });
        setUp(server.url);
        await run();
        fs.writeFileSync(path.join(home, '.config/dashboard/kiosk.env'), 'DASHBOARD_URL=http://127.0.0.1:9\n');
        expect(await run('15:00')).toBeNull();
        expect(await run('23:30')).toBe('--off *');
        fs.rmSync(path.join(home, 'wlopm.log'));
        expect(await run('03:00')).toBe('--off *');
        fs.rmSync(path.join(home, 'wlopm.log'));
        expect(await run('06:30')).toBeNull();
    });

    it('leaves the display on when it knows nothing', async () => {
        setUp('http://127.0.0.1:9');
        expect(await run('23:30')).toBeNull();
    });
});
