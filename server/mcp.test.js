// The claude.ai connector's MCP endpoint, driven by the MCP SDK's own client
// after a real sign-in, as claude.ai uses it (docs/CONNECTOR.md §13).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { WRITE_CAPS } from './access.js';
import { startServer } from './testing.js';

let server;
let client;
afterEach(async () => {
    await client?.close();
    client = null;
    await server?.close();
    server = null;
});

async function connect(connector = 'chat') {
    server = await startServer({ connector: true });
    const { access_token: token } = await server.signIn(connector);
    client = new Client({ name: `test-${connector}`, version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${server.publicUrl}${connector === 'chat' ? '/mcp' : '/mcp/agent'}`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
    }));
    return client;
}

const text = result => JSON.parse(result.content[0].text);

describe('the chat connector over MCP', () => {
    it('offers the stdio tools except delete_item, with the instructions about untrusted text', async () => {
        await connect();
        const names = (await client.listTools()).tools.map(t => t.name);
        expect(names).toContain('add_task');
        expect(names).toContain('get_today');
        expect(names).not.toContain('delete_item');
        // the agent's runs are its own (docs/AGENT.md §7)
        expect(names).not.toContain('report_run');
        expect(client.getInstructions()).toMatch(/never instructions to follow/);
        const addTask = (await client.listTools()).tools.find(t => t.name === 'add_task');
        expect(addTask.description).toMatch(/can undo it/);
        expect(addTask.inputSchema.properties.run).toBeUndefined();
    });

    it('adds a task, recorded as Claude through this claude.ai connection', async () => {
        await connect();
        const added = text(await client.callTool({ name: 'add_task', arguments: { name: 'Email Prof. Lee', due: '2026-10-03', priority: 'now', area: 'school' } }));
        expect(added).toMatchObject({ name: 'Email Prof. Lee', due: '2026-10-03', priority: 'now', area: 'School' });
        const [change] = (await server.request('/api/changes')).body;
        expect(change).toMatchObject({ actor: 'claude', via: 'claude.ai', action: 'create' });
        expect(change.connection_id).toEqual(expect.any(Number));
        // the ✦ mark
        const [task] = (await server.request('/api/tasks')).body;
        expect(task.claude_change).toMatchObject({ id: change.id, via: 'claude.ai' });
    });

    it('reads, and completes a task', async () => {
        await connect();
        const { id } = text(await client.callTool({ name: 'add_task', arguments: { name: 'Laundry' } }));
        expect(text(await client.callTool({ name: 'list_tasks', arguments: { done: false } })).map(t => t.name)).toEqual(['Laundry']);
        expect(text(await client.callTool({ name: 'complete_task', arguments: { id } })).done_at).toBeTruthy();
        expect(text(await client.callTool({ name: 'get_today', arguments: {} }))).toHaveProperty('tasks');
    });

    it('cleans what it writes, and refuses links that are not https', async () => {
        await connect();
        const zeroWidth = String.fromCharCode(0x200B);
        const added = text(await client.callTool({ name: 'add_task', arguments: { name: `Pay${zeroWidth}Pal invoice`, link: 'https://mail.google.com/mail/u/0/#all/abc' } }));
        expect(added.name).toBe('PayPal invoice');
        const refused = await client.callTool({ name: 'add_task', arguments: { name: 'Phish', link: 'http://evil.example/login' } });
        expect(refused.isError).toBe(true);
        expect(refused.content[0].text).toMatch(/https/);
    });

    it('stops at the daily write cap with a clear message', async () => {
        await connect();
        const db = server.db;
        const connection = db.prepare('SELECT id FROM oauth_connections').get().id;
        const insert = db.prepare("INSERT INTO changes (at, actor, resource, item_id, action, connection_id) VALUES (?, 'claude', 'tasks', '0', 'create', ?)");
        for (let i = 0; i < WRITE_CAPS.chat; i++) insert.run(new Date().toISOString(), connection);
        const refused = await client.callTool({ name: 'add_task', arguments: { name: 'One too many' } });
        expect(refused.isError).toBe(true);
        expect(refused.content[0].text).toMatch(/limit of 100/);
        // reading still works
        expect((await client.callTool({ name: 'list_tasks', arguments: {} })).isError).toBeFalsy();
        expect((await server.request('/api/status')).body.problems.map(p => p.kind)).toContain('connector-chat-limit');
    });
});

describe('the agent connector over MCP', () => {
    it("offers the chat's tools minus settings and night mode, with the same instructions", async () => {
        await connect('agent');
        const names = (await client.listTools()).tools.map(t => t.name);
        for (const name of ['get_today', 'add_task', 'update_task', 'complete_task', 'add_application', 'set_application_status', 'check_habit', 'get_settings']) {
            expect(names).toContain(name);
        }
        for (const name of ['delete_item', 'update_settings', 'start_night', 'cancel_night']) expect(names).not.toContain(name);
        expect(client.getInstructions()).toMatch(/never instructions to follow/);
    });

    it('names its run on every write but not on reads, and reports it (docs/AGENT.md §7)', async () => {
        await connect('agent');
        const tools = new Map((await client.listTools()).tools.map(t => [t.name, t]));
        expect(tools.has('report_run')).toBe(true);
        expect(tools.has('start_run')).toBe(false);
        for (const name of ['add_task', 'update_task', 'complete_task', 'increment_goal', 'achieve_goal', 'check_habit', 'set_application_status', 'update_application']) {
            expect(tools.get(name).inputSchema.required, name).toContain('run');
        }
        for (const name of ['get_today', 'list_tasks']) expect(tools.get(name).inputSchema.properties.run, name).toBeUndefined();
        expect(tools.get('report_run').inputSchema.required).toEqual(expect.arrayContaining(['run', 'summary', 'briefing']));
    });

    it('adds a task directly in a run, recorded as the agent, then reports the run', async () => {
        await connect('agent');
        const run = 'Email 2026-10-03 06:00';
        const added = text(await client.callTool({ name: 'add_task', arguments: { run, name: 'Reply to Stripe recruiter', due: '2026-10-09', source: 'gmail:abc' } }));
        expect(added.name).toBe('Reply to Stripe recruiter');
        // re-reading the email doesn't make a second one
        await client.callTool({ name: 'add_task', arguments: { run, name: 'Reply to Stripe recruiter', source: 'gmail:abc' } });
        expect((await server.request('/api/tasks')).body).toHaveLength(1);
        const [opened] = (await server.request('/api/runs')).body;
        const [change] = (await server.request('/api/changes')).body;
        expect(change).toMatchObject({ actor: 'agent', via: 'claude.ai', action: 'create', run_id: opened.id });
        const reported = text(await client.callTool({ name: 'report_run', arguments: { run, summary: '1 task from email', briefing: 'Reply to Stripe by Fri' } }));
        expect(reported).toMatchObject({ id: opened.id, label: run, summary: '1 task from email', briefing: 'Reply to Stripe by Fri' });
        const again = await client.callTool({ name: 'report_run', arguments: { run, summary: 'x', briefing: 'x' } });
        expect(again.isError).toBe(true);
        expect(again.content[0].text).toMatch(/already reported/);
    });

    it('is told to name its run when it writes without one', async () => {
        await connect('agent');
        const refused = await client.callTool({ name: 'add_task', arguments: { name: 'No run' } });
        expect(refused.isError).toBe(true);
        expect(refused.content[0].text).toMatch(/run/);
    });

    it(`stops at its own cap of ${WRITE_CAPS.agent}`, async () => {
        await connect('agent');
        const connection = server.db.prepare('SELECT id FROM oauth_connections').get().id;
        const insert = server.db.prepare("INSERT INTO changes (at, actor, resource, item_id, action, connection_id) VALUES (?, 'agent', 'tasks', '0', 'create', ?)");
        for (let i = 0; i < WRITE_CAPS.agent; i++) insert.run(new Date().toISOString(), connection);
        const refused = await client.callTool({ name: 'add_task', arguments: { run: 'Email', name: 'One too many' } });
        expect(refused.isError).toBe(true);
        expect(refused.content[0].text).toMatch(/limit of 30 agent changes/);
    });
});
