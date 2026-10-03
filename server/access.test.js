// What a claude.ai connector's token may do on the API (docs/CONNECTOR.md §5).
import { afterEach, describe, expect, it } from 'vitest';
import { WRITE_CAPS, isAllowed, startOfToday } from './access.js';
import { KIOSK_TOKEN, startServer } from './testing.js';

let server;
afterEach(async () => {
    await server?.close();
    server = null;
});

// a request as one of claude.ai's connectors, straight to the private API.
// The agent's writes each name a run (docs/AGENT.md §7), so for the agent
// this sends a run label, as mcp/client.js does.
const RUN = 'Email 2026-10-03 06:00';
async function start(connector = 'chat', options = {}) {
    server = await startServer({ connector: true, ...options });
    const { access_token: token } = await server.signIn(connector);
    const runHeader = connector === 'agent' ? { 'x-dashboard-run': RUN } : {};
    const as = (path, { headers = {}, ...rest } = {}) => server.request(path, { ...rest, headers: { ...runHeader, ...headers }, token });
    as.token = token;
    return as;
}

describe('isAllowed', () => {
    it('lets the chat connector read, add and change, but never delete', () => {
        const allowed = [
            ['GET', '/today'], ['GET', '/tasks'], ['GET', '/tasks/'], ['GET', '/settings'], ['GET', '/night'], ['GET', '/events'],
            ['POST', '/tasks'], ['PATCH', '/tasks/12'], ['POST', '/goals/3/increment'], ['PATCH', '/applications/4'],
            ['PATCH', '/settings'], ['POST', '/night/start'], ['POST', '/night/cancel'],
            ['PUT', '/habits/2/checks/2026-10-01'], ['DELETE', '/habits/2/checks/2026-10-01'],
        ];
        const refused = [
            ['DELETE', '/tasks/12'], ['DELETE', '/habits/2'], ['GET', '/export'], ['GET', '/changes'], ['POST', '/changes/1/undo'],
            ['POST', '/changes/undo-since'], ['GET', '/connectors'], ['PUT', '/connectors/chat'], ['GET', '/connections'],
            ['POST', '/connections/1/revoke'], ['GET', '/connect/x'], ['POST', '/connect/x/approve'], ['PUT', '/location/kiosk'],
            ['GET', '/session'], ['GET', '/status'], ['GET', '/weather'], ['POST', '/login'], ['GET', '/tasks/12/../../export'],
            ['PATCH', '/tasks'], ['POST', '/tasks/12'], ['GET', '/nothing'], ['PATCH', '/goals/x'], ['POST', '/applications/4/advance'],
        ];
        for (const [method, path] of allowed) expect(isAllowed('chat', method, path), `${method} ${path}`).toBe(true);
        for (const [method, path] of refused) expect(isAllowed('chat', method, path), `${method} ${path}`).toBe(false);
    });

    it('lets the agent connector read, add and change, but not delete, touch settings or start night mode', () => {
        const allowed = [
            ['GET', '/today'], ['GET', '/tasks'], ['GET', '/areas'], ['GET', '/settings'], ['GET', '/night'], ['GET', '/birthdays'],
            ['POST', '/tasks'], ['PATCH', '/tasks/12'], ['POST', '/countdowns'], ['PATCH', '/countdowns/2'],
            ['POST', '/goals/3/increment'], ['POST', '/goals/3/achieve'], ['POST', '/habits'], ['PUT', '/habits/2/checks/2026-10-01'],
            ['POST', '/applications'], ['PATCH', '/applications/4'],
        ];
        const refused = [
            ['DELETE', '/tasks/12'], ['DELETE', '/habits/2/checks/2026-10-01'], ['PATCH', '/settings'],
            ['POST', '/night/start'], ['POST', '/night/cancel'], ['POST', '/areas'], ['GET', '/export'], ['GET', '/changes'],
            ['POST', '/changes/1/undo'], ['POST', '/changes/undo-since'], ['PUT', '/connectors/agent'], ['GET', '/connections'],
            ['PUT', '/location/kiosk'], ['GET', '/status'],
        ];
        for (const [method, path] of allowed) expect(isAllowed('agent', method, path), `${method} ${path}`).toBe(true);
        for (const [method, path] of refused) expect(isAllowed('agent', method, path), `${method} ${path}`).toBe(false);
    });

    it("lets only the agent report runs, and neither connector read them (docs/AGENT.md §7)", () => {
        expect(isAllowed('agent', 'POST', '/runs')).toBe(true);
        for (const [method, path] of [['GET', '/runs'], ['GET', '/runs/3'], ['PATCH', '/runs/3'], ['POST', '/runs/3/report']]) {
            expect(isAllowed('agent', method, path), `${method} ${path}`).toBe(false);
        }
        for (const [method, path] of [['GET', '/runs'], ['POST', '/runs']]) {
            expect(isAllowed('chat', method, path), `${method} ${path}`).toBe(false);
        }
    });

    it('allows an unknown connector nothing', () => {
        expect(isAllowed('nobody', 'GET', '/today')).toBe(false);
    });

    it('counts the day from midnight in the dashboard time zone', () => {
        // tests run in America/Chicago: midnight there is 05:00 UTC in October
        expect(startOfToday(Date.parse('2026-10-01T15:00:00Z'))).toBe('2026-10-01T05:00:00.000Z');
        expect(startOfToday(Date.parse('2026-10-01T03:00:00Z'))).toBe('2026-09-30T05:00:00.000Z');
    });
});

describe('a chat connector token on the API', () => {
    it('reads and writes what its list allows, and nothing else', async () => {
        const asClaude = await start();
        expect((await asClaude('/api/today')).status).toBe(200);
        const task = (await asClaude('/api/tasks', { method: 'POST', body: { name: 'From a chat' } })).body;
        expect((await asClaude(`/api/tasks/${task.id}`, { method: 'PATCH', body: { priority: 'now' } })).status).toBe(200);
        // areas are read-only: Claude chooses from them (docs/BLOCKS.md §3)
        expect((await asClaude('/api/areas')).status).toBe(200);
        const refused = [
            ['POST', '/api/areas'], ['PATCH', '/api/areas/1'], ['DELETE', '/api/areas/1'],
            ['DELETE', `/api/tasks/${task.id}`], ['GET', '/api/export'], ['GET', '/api/changes'], ['POST', '/api/changes/1/undo'],
            ['POST', '/api/changes/undo-since'], ['GET', '/api/connections'], ['PUT', '/api/connectors/chat'], ['GET', '/api/status'],
            ['GET', '/api/session'], ['PUT', '/api/location/kiosk'],
        ];
        for (const [method, path] of refused) {
            const res = await asClaude(path, { method, body: method === 'GET' || method === 'DELETE' ? undefined : {} });
            expect(res.status, `${method} ${path}`).toBe(403);
        }
        // the task is still there
        expect((await server.request(`/api/tasks`)).body).toHaveLength(1);
    });

    it("is recorded as Claude through its connection, whatever header it sends", async () => {
        const asClaude = await start();
        await asClaude('/api/tasks', { method: 'POST', body: { name: 'x' }, headers: { 'x-dashboard-client': 'owner' } });
        const [change] = (await server.request('/api/changes')).body;
        expect(change).toMatchObject({ actor: 'claude', via: 'claude.ai' });
        expect(change.connection_id).toEqual(expect.any(Number));
    });

    it('has its text cleaned and its links checked; the owner does not', async () => {
        const asClaude = await start();
        const rlo = String.fromCharCode(0x202E);
        const task = (await asClaude('/api/tasks', { method: 'POST', body: { name: `invoice${rlo}fdp.exe`, notes: 'one\ntwo' } })).body;
        expect(task.name).toBe('invoicefdp.exe');
        expect(task.notes).toBe('one\ntwo');
        expect((await asClaude('/api/tasks', { method: 'POST', body: { name: 'x', link: 'javascript:alert(1)' } })).status).toBe(400);
        expect((await asClaude('/api/applications', { method: 'POST', body: { company: 'A', role: 'B', url: 'http://a.example' } })).status).toBe(400);
        const owners = (await server.request('/api/tasks', { method: 'POST', body: { name: `mine${rlo}` } })).body;
        expect(owners.name).toBe(`mine${rlo}`);
    });

    it('can uncheck a habit, which deletes nothing', async () => {
        const asClaude = await start();
        const habit = (await server.request('/api/habits', { method: 'POST', body: { name: 'Read' } })).body;
        const today = new Date().toLocaleDateString('en-CA');
        expect((await asClaude(`/api/habits/${habit.id}/checks/${today}`, { method: 'PUT' })).status).toBe(200);
        expect((await asClaude(`/api/habits/${habit.id}/checks/${today}`, { method: 'DELETE' })).status).toBe(200);
        expect((await asClaude(`/api/habits/${habit.id}`, { method: 'DELETE' })).status).toBe(403);
    });

    it(`stops writing after ${WRITE_CAPS.chat} changes a day, but keeps reading`, async () => {
        const asClaude = await start();
        for (let i = 0; i < WRITE_CAPS.chat; i++) {
            expect((await asClaude('/api/tasks', { method: 'POST', body: { name: `Task ${i}` } })).status).toBe(201);
        }
        const refused = await asClaude('/api/tasks', { method: 'POST', body: { name: 'One too many' } });
        expect(refused.status).toBe(429);
        expect(refused.body.error.message).toMatch(/limit of 100/);
        expect((await asClaude('/api/tasks')).status).toBe(200);
        // the owner isn't limited
        expect((await server.request('/api/tasks', { method: 'POST', body: { name: 'Mine' } })).status).toBe(201);
        expect((await server.request('/api/connectors')).body[0]).toMatchObject({ name: 'chat', writes_today: WRITE_CAPS.chat, write_cap: WRITE_CAPS.chat });
    });

    it("can't say the owner has looked at the agent's changes", async () => {
        const asClaude = await start();
        const refused = await asClaude('/api/settings', { method: 'PATCH', body: { agent_seen_at: new Date().toISOString() } });
        expect(refused.status).toBe(403);
        expect((await server.request('/api/settings')).body.agent_seen_at).toBeNull();
        // the night hours still can be
        expect((await asClaude('/api/settings', { method: 'PATCH', body: { night_start: '23:00' } })).status).toBe(200);
    });
});

describe("the agent connector's token on the API", () => {
    it('adds and changes items directly, recorded as the agent', async () => {
        const asAgent = await start('agent');
        expect((await asAgent('/api/today')).status).toBe(200);
        const task = (await asAgent('/api/tasks', { method: 'POST', body: { name: 'Reply to Stripe recruiter', due: '2026-10-09' } })).body;
        expect((await asAgent(`/api/tasks/${task.id}`, { method: 'PATCH', body: { priority: 'now' } })).status).toBe(200);
        const goal = (await asAgent('/api/goals', { method: 'POST', body: { name: 'Read', target: 10 } })).body;
        expect((await asAgent(`/api/goals/${goal.id}/increment`, { method: 'POST', body: {} })).status).toBe(200);
        const application = (await asAgent('/api/applications', { method: 'POST', body: { company: 'Stripe', role: 'Intern', url: 'https://stripe.com/jobs' } })).body;
        expect((await asAgent(`/api/applications/${application.id}`, { method: 'PATCH', body: { status: 'oa' } })).status).toBe(200);
        const changes = (await server.request('/api/changes')).body;
        expect(changes).toHaveLength(6);
        for (const change of changes) expect(change).toMatchObject({ actor: 'agent', via: 'claude.ai' });
        // the ✦ mark, as for chats
        expect((await server.request('/api/tasks')).body[0].claude_change).toMatchObject({ actor: 'agent' });
    });

    it('is refused any delete, settings, night mode, and the owner\'s routes', async () => {
        const asAgent = await start('agent');
        const task = (await asAgent('/api/tasks', { method: 'POST', body: { name: 'Keep me' } })).body;
        const habit = (await server.request('/api/habits', { method: 'POST', body: { name: 'Read' } })).body;
        const today = new Date().toLocaleDateString('en-CA');
        expect((await asAgent(`/api/habits/${habit.id}/checks/${today}`, { method: 'PUT' })).status).toBe(200);
        const refused = [
            ['DELETE', `/api/tasks/${task.id}`], ['DELETE', `/api/habits/${habit.id}`], ['DELETE', `/api/habits/${habit.id}/checks/${today}`],
            ['PATCH', '/api/settings'], ['POST', '/api/night/start'], ['POST', '/api/night/cancel'], ['POST', '/api/areas'],
            ['GET', '/api/export'], ['GET', '/api/changes'], ['POST', '/api/changes/undo-since'], ['PUT', '/api/connectors/agent'],
            ['GET', '/api/connections'], ['PUT', '/api/location/kiosk'],
        ];
        for (const [method, path] of refused) {
            const res = await asAgent(path, { method, body: method === 'GET' || method === 'DELETE' ? undefined : {} });
            expect(res.status, `${method} ${path}`).toBe(403);
        }
        expect((await server.request('/api/tasks')).body).toHaveLength(1);
        // not started early (the hours themselves depend on the clock)
        expect((await server.request('/api/night')).body.early).toBe(false);
    });

    it('has its text cleaned and its links checked, like a chat', async () => {
        const asAgent = await start('agent');
        const zeroWidth = String.fromCharCode(0x200B);
        expect((await asAgent('/api/tasks', { method: 'POST', body: { name: `Pay${zeroWidth}Pal` } })).body.name).toBe('PayPal');
        expect((await asAgent('/api/applications', { method: 'POST', body: { company: 'A', role: 'B', url: 'http://evil.example' } })).status).toBe(400);
    });

    it(`stops writing after ${WRITE_CAPS.agent} changes a day, counted apart from chats`, async () => {
        const asAgent = await start('agent');
        const { access_token: chatToken } = await server.signIn('chat');
        const asChat = (path, options = {}) => server.request(path, { ...options, token: chatToken });
        // a chat's changes don't use up the agent's day
        for (let i = 0; i < 5; i++) expect((await asChat('/api/tasks', { method: 'POST', body: { name: `Chat ${i}` } })).status).toBe(201);
        for (let i = 0; i < WRITE_CAPS.agent; i++) {
            expect((await asAgent('/api/tasks', { method: 'POST', body: { name: `Agent ${i}` } })).status).toBe(201);
        }
        const refused = await asAgent('/api/tasks', { method: 'POST', body: { name: 'One too many' } });
        expect(refused.status).toBe(429);
        expect(refused.body.error.message).toBe("Today's limit of 30 agent changes is used up. It resets at midnight.");
        expect((await asAgent('/api/tasks')).status).toBe(200);
        // nor the agent's the chat's
        expect((await asChat('/api/tasks', { method: 'POST', body: { name: 'Chat again' } })).status).toBe(201);
        const connectors = (await server.request('/api/connectors')).body;
        expect(connectors.find(c => c.name === 'chat')).toMatchObject({ writes_today: 6, write_cap: 100 });
        expect(connectors.find(c => c.name === 'agent')).toMatchObject({ writes_today: WRITE_CAPS.agent, write_cap: WRITE_CAPS.agent, runs_today: 1, run_cap: 5 });
        const problems = (await server.request('/api/status')).body.problems;
        expect(problems).toEqual([{ kind: 'connector-agent-limit', message: "Today's limit of 30 agent changes is used up" }]);
    });

    it("can't say the owner has looked at its changes", async () => {
        const asAgent = await start('agent');
        expect((await asAgent('/api/settings', { method: 'PATCH', body: { agent_seen_at: new Date().toISOString() } })).status).toBe(403);
    });
});

describe("undoing the agent's changes since the owner last looked (docs/AGENT.md §3)", () => {
    it("undoes only the agent's, and skips one the owner has edited since, listing it", async () => {
        const asAgent = await start('agent');
        const seen = new Date(Date.now() - 1000).toISOString();
        await server.request('/api/settings', { method: 'PATCH', body: { agent_seen_at: seen } });
        const { access_token: chatToken } = await server.signIn('chat');
        await server.request('/api/tasks', { method: 'POST', body: { name: 'Mine' }, token: chatToken });
        const kept = (await asAgent('/api/tasks', { method: 'POST', body: { name: 'Edited since' } })).body;
        await asAgent('/api/tasks', { method: 'POST', body: { name: 'From an email' } });
        await server.request(`/api/tasks/${kept.id}`, { method: 'PATCH', body: { name: 'Edited by Luke' } });

        // what the dock's chip counts, and what Undo all of these sends
        expect((await server.request(`/api/changes?actor=agent&since=${encodeURIComponent(seen)}`)).body).toHaveLength(2);
        const { undone, skipped } = (await server.request('/api/changes/undo-since', { method: 'POST', body: { since: seen, actors: ['agent'] } })).body;
        expect(undone.map(c => c.after.name)).toEqual(['From an email']);
        expect(skipped.map(s => s.change.after.name)).toEqual(['Edited since']);
        expect((await server.request('/api/tasks')).body.map(t => t.name).sort()).toEqual(['Edited by Luke', 'Mine']);
    });
});

describe("the agent's runs through its connector (docs/AGENT.md §7)", () => {
    const runs = async () => (await server.request('/api/runs')).body;
    const report = (as, run = RUN, body = { summary: 'Done', briefing: 'Done' }) => as('/api/runs', { method: 'POST', body: { run, ...body } });

    it('opens a run with its first change, records each change with it, and undoes one run alone even when two overlap', async () => {
        const asAgent = await start('agent');
        const other = { 'x-dashboard-run': 'Job search 2026-10-03 06:00' };
        await asAgent('/api/tasks', { method: 'POST', body: { name: 'First run, 1' } });
        await asAgent('/api/tasks', { method: 'POST', body: { name: 'Second run' }, headers: other });
        await asAgent('/api/tasks', { method: 'POST', body: { name: 'First run, 2' } });
        const [second, first] = await runs();
        expect(first).toMatchObject({ label: RUN, ended_at: null, connection_id: expect.any(Number) });
        expect(second.label).toBe('Job search 2026-10-03 06:00');
        const changes = (await server.request('/api/changes?actor=agent')).body;
        expect(changes.map(c => [c.after.name, c.run_id])).toEqual([['First run, 2', first.id], ['Second run', second.id], ['First run, 1', first.id]]);
        expect((await server.request(`/api/changes?run=${second.id}`)).body.map(c => c.after.name)).toEqual(['Second run']);

        // the report closes the run it opened
        expect((await report(asAgent)).body).toMatchObject({ id: first.id, summary: 'Done' });
        const { undone } = (await server.request('/api/changes/undo-since', { method: 'POST', body: { run: first.id, actors: ['agent'] } })).body;
        expect(undone.map(c => c.after.name)).toEqual(['First run, 2', 'First run, 1']);
        expect((await server.request('/api/tasks')).body.map(t => t.name)).toEqual(['Second run']);
        // the undo is the owner's, in no run
        expect((await server.request('/api/changes?actor=owner')).body.every(c => c.run_id === null)).toBe(true);
    });

    it('refuses a change that names no run, or a run that has reported', async () => {
        const asAgent = await start('agent');
        const none = await server.request('/api/tasks', { method: 'POST', body: { name: 'Stray' }, token: asAgent.token });
        expect(none.status).toBe(400);
        expect(none.body.error.message).toMatch(/^This change names no run\. Pass the same run label/);
        expect((await asAgent('/api/tasks', { method: 'POST', body: { name: 'Stray' }, headers: { 'x-dashboard-run': 'bad;label' } })).status).toBe(400);
        await report(asAgent);
        const reported = await asAgent('/api/tasks', { method: 'POST', body: { name: 'Stray' } });
        expect(reported.status).toBe(409);
        expect(reported.body.error.message).toMatch(/^The run "Email 2026-10-03 06:00" already reported at .*A new run needs a new label\.$/);
        expect((await server.request('/api/tasks')).body).toEqual([]);
        // reads need no run
        expect((await server.request('/api/tasks', { token: asAgent.token })).status).toBe(200);
    });

    it('closes a run to changes and its report after 3 hours', async () => {
        let clock = Date.now();
        const asAgent = await start('agent', { now: () => clock });
        await asAgent('/api/tasks', { method: 'POST', body: { name: 'Early' } });
        clock += 3 * 60 * 60 * 1000 + 1000;
        // a fresh token, since the first has expired by now
        const { access_token: token } = await server.signIn('agent');
        const late = await server.request('/api/tasks', { method: 'POST', body: { name: 'Late' }, token, headers: { 'x-dashboard-run': RUN } });
        expect(late.status).toBe(409);
        expect(late.body.error.message).toBe(`The run "${RUN}" started over 3 hours ago, so it's closed. A new run needs a new label.`);
        const lateReport = await server.request('/api/runs', { method: 'POST', body: { run: RUN, summary: 'x', briefing: 'x' }, token });
        expect(lateReport.status).toBe(409);
    });

    it("ignores the owner's run header", async () => {
        await start('agent');
        const task = await server.request('/api/tasks', { method: 'POST', body: { name: 'Mine' }, headers: { 'x-dashboard-run': RUN } });
        expect(task.status).toBe(201);
        expect((await server.request('/api/changes')).body[0].run_id).toBeNull();
        expect(await runs()).toEqual([]);
    });

    it(`can still report a run after its ${WRITE_CAPS.agent} changes`, async () => {
        const asAgent = await start('agent');
        for (let i = 0; i < WRITE_CAPS.agent; i++) await asAgent('/api/tasks', { method: 'POST', body: { name: `Agent ${i}` } });
        expect((await asAgent('/api/tasks', { method: 'POST', body: { name: 'One too many' } })).status).toBe(429);
        expect((await report(asAgent, RUN, { summary: '30 tasks', briefing: 'Hit the limit' })).status).toBe(200);
        // and a quiet run after it
        expect((await report(asAgent, 'Email 2026-10-03 12:00')).status).toBe(200);
    });

    it('opens at most agent_runs_per_day runs a day, which only the owner can raise', async () => {
        const asAgent = await start('agent');
        for (let i = 0; i < 4; i++) expect((await report(asAgent, `Run ${i}`)).status).toBe(200);
        // the fifth by a change, the sixth refused either way
        expect((await asAgent('/api/tasks', { method: 'POST', body: { name: 'Fifth' }, headers: { 'x-dashboard-run': 'Run 4' } })).status).toBe(201);
        const refused = await asAgent('/api/tasks', { method: 'POST', body: { name: 'Sixth' }, headers: { 'x-dashboard-run': 'Run 5' } });
        expect(refused.status).toBe(429);
        expect(refused.body.error.message).toBe("Today's limit of 5 agent runs is used up. It resets at midnight, or the owner can raise it on /manage.");
        expect((await report(asAgent, 'Run 5')).status).toBe(429);
        // an open run can still be reported
        expect((await report(asAgent, 'Run 4')).status).toBe(200);
        expect((await asAgent('/api/settings', { method: 'PATCH', body: { agent_runs_per_day: 50 } })).status).toBe(403);
        const { access_token: chatToken } = await server.signIn('chat');
        const asChat = await server.request('/api/settings', { method: 'PATCH', body: { agent_runs_per_day: 50 }, token: chatToken });
        expect(asChat.status).toBe(403);
        expect(asChat.body.error.message).toBe("claude.ai can't set agent_runs_per_day. The owner does that on the dashboard.");
        await server.request('/api/settings', { method: 'PATCH', body: { agent_runs_per_day: 6 } });
        expect((await report(asAgent, 'Run 5')).status).toBe(200);
        expect((await report(asAgent, 'Run 6')).status).toBe(429);
    });

    it("can't read runs back, and the chat connector can't report one", async () => {
        const asAgent = await start('agent');
        expect((await asAgent('/api/runs')).status).toBe(403);
        const { access_token: chatToken } = await server.signIn('chat');
        expect((await server.request('/api/runs', { method: 'POST', body: { run: 'x', summary: 'x', briefing: 'x' }, token: chatToken })).status).toBe(403);
        expect((await server.request('/api/runs', { token: KIOSK_TOKEN })).status).toBe(200);
    });

    it('has its report cleaned to one line', async () => {
        const asAgent = await start('agent');
        const zeroWidth = String.fromCharCode(0x200B);
        const reported = (await report(asAgent, RUN, { summary: 'one\ntwo', briefing: `a${zeroWidth}b\n\nc` })).body;
        expect(reported).toMatchObject({ summary: 'one two', briefing: 'ab c' });
    });

    it('warns in the status line about a run that never reported, until the agent is switched off', async () => {
        let clock = Date.now();
        const asAgent = await start('agent', { now: () => clock });
        await asAgent('/api/tasks', { method: 'POST', body: { name: 'Then it crashed' } });
        clock += 3 * 60 * 60 * 1000 + 1000;
        const problems = async () => (await server.request('/api/status')).body.problems.map(p => p.kind);
        expect(await problems()).toEqual(['agent-runs']);
        await server.request('/api/connectors/agent', { method: 'PUT', body: { enabled: false } });
        expect(await problems()).toEqual([]);
    });
});
