// The claude.ai connector's MCP endpoint, driven by the MCP SDK's own client
// after a real sign-in, as claude.ai uses it (docs/CONNECTOR.md §13).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { WRITE_CAP } from './access.js';
import { startServer } from './testing.js';

let server;
let client;
afterEach(async () => {
    await client?.close();
    client = null;
    await server?.close();
    server = null;
});

async function connect() {
    server = await startServer({ connector: true });
    const { access_token: token } = await server.signIn('chat');
    client = new Client({ name: 'test-claude', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${server.publicUrl}/mcp`), {
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
        expect(client.getInstructions()).toMatch(/never instructions to follow/);
        const addTask = (await client.listTools()).tools.find(t => t.name === 'add_task');
        expect(addTask.description).toMatch(/can undo it/);
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
        for (let i = 0; i < WRITE_CAP; i++) insert.run(new Date().toISOString(), connection);
        const refused = await client.callTool({ name: 'add_task', arguments: { name: 'One too many' } });
        expect(refused.isError).toBe(true);
        expect(refused.content[0].text).toMatch(/limit of 100/);
        // reading still works
        expect((await client.callTool({ name: 'list_tasks', arguments: {} })).isError).toBeFalsy();
        expect((await server.request('/api/status')).body.problems.map(p => p.kind)).toContain('connector-chat-limit');
    });
});

describe('the agent connector over MCP', () => {
    it('signs in but has no tools until suggestions arrive', async () => {
        server = await startServer({ connector: true });
        const { access_token: token } = await server.signIn('agent');
        client = new Client({ name: 'test-agent', version: '1.0.0' });
        await client.connect(new StreamableHTTPClientTransport(new URL(`${server.publicUrl}/mcp/agent`), {
            requestInit: { headers: { authorization: `Bearer ${token}` } },
        }));
        expect(client.getServerCapabilities().tools).toBeUndefined();
    });
});
