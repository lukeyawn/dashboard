// Starts mcp/index.js the way Claude does, over stdio, against a test server.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, expect, it } from 'vitest';
import { API_TOKEN, startServer } from '../server/testing.js';

let server;
let client;
afterEach(async () => {
    await client?.close();
    await server?.close();
});

it('serves the tools over stdio, talking to the dashboard it is pointed at', async () => {
    server = await startServer();
    await server.request('/api/tasks', { method: 'POST', body: { name: 'From the API' } });
    client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(new StdioClientTransport({
        command: process.execPath,
        args: [new URL('./index.js', import.meta.url).pathname],
        env: { DASHBOARD_URL: server.url, DASHBOARD_TOKEN: API_TOKEN, PATH: process.env.PATH },
        stderr: 'pipe',
    }));
    const res = await client.callTool({ name: 'list_tasks', arguments: {} });
    expect(JSON.parse(res.content[0].text).map(t => t.name)).toEqual(['From the API']);
});

it('refuses to start without its settings', async () => {
    const { spawnSync } = await import('node:child_process');
    const run = spawnSync(process.execPath, [new URL('./index.js', import.meta.url).pathname], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('DASHBOARD_URL');
    expect(run.stdout).toBe('');
});
