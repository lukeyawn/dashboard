// vm/oauth-client.sh, run for real on a scratch .env.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { connectorConfig } from '../server/oauth.js';

const SCRIPT = new URL('./oauth-client.sh', import.meta.url).pathname;
let dir;
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function scratch(contents) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-client-'));
    const file = path.join(dir, '.env');
    if (contents !== undefined) fs.writeFileSync(file, contents, { mode: 0o644 });
    return file;
}

const run = (file, ...args) => promisify(execFile)('bash', [SCRIPT, ...args], { env: { PATH: process.env.PATH, ENV_FILE: file } })
    .then(({ stdout }) => ({ code: 0, stdout }), err => ({ code: err.code, stdout: err.stdout, stderr: err.stderr }));

const parse = file => Object.fromEntries(fs.readFileSync(file, 'utf8').trim().split('\n').map(line => line.split(/=(.*)/s).slice(0, 2)));

describe('oauth-client.sh', () => {
    it('adds long random credentials and the addresses, readable only by the owner, and the server accepts them', async () => {
        const file = scratch('API_TOKEN=abc');
        const { code, stdout } = await run(file, 'https://dashboard.tail.ts.net');
        expect(code).toBe(0);
        expect(stdout).toContain('Added to');
        const env = parse(file);
        expect(env.API_TOKEN).toBe('abc');
        expect(env.PUBLIC_URL).toBe('https://dashboard.tail.ts.net');
        expect(env.TAILNET_URL).toBe('https://dashboard.tail.ts.net:8443');
        for (const key of ['OAUTH_CHAT_CLIENT_ID', 'OAUTH_CHAT_CLIENT_SECRET', 'OAUTH_REFRESH_KEY']) {
            expect(env[key]).toMatch(/^[\w-]{40,}$/);
        }
        expect(fs.statSync(file).mode & 0o777).toBe(0o600);
        expect(connectorConfig(env).clients.chat.id).toBe(env.OAUTH_CHAT_CLIENT_ID);
    });

    it('never changes what is already there', async () => {
        const file = scratch('PUBLIC_URL=https://first.ts.net\nTAILNET_URL=https://first.ts.net:8443\n');
        await run(file);
        const first = fs.readFileSync(file, 'utf8');
        const again = await run(file, 'https://first.ts.net');
        expect(again.stdout).toContain('Nothing to add');
        expect(fs.readFileSync(file, 'utf8')).toBe(first);
    });

    it('refuses to change PUBLIC_URL, rather than silently keeping the old one', async () => {
        const file = scratch('PUBLIC_URL=https://first.ts.net:8443\n');
        const changed = await run(file, 'https://second.ts.net');
        expect(changed.code).toBe(1);
        expect(changed.stderr).toMatch(/delete the PUBLIC_URL and TAILNET_URL lines/);
        expect(fs.readFileSync(file, 'utf8')).toBe('PUBLIC_URL=https://first.ts.net:8443\n');
    });

    it('refuses a PUBLIC_URL with a port or a path, and a missing .env', async () => {
        const file = scratch('');
        for (const url of ['https://dashboard.tail.ts.net:8443', 'https://dashboard.tail.ts.net/', 'http://dashboard.tail.ts.net']) {
            expect((await run(file, url)).code).toBe(1);
        }
        expect(fs.readFileSync(file, 'utf8')).toBe('');
        expect((await run(path.join(dir, 'missing')).then(r => r.code))).toBe(1);
    });
});
