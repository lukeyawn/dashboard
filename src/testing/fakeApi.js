// A fake of the API for frontend tests: install() replaces fetch with an
// in-memory tasks API and records every request.
import { vi } from 'vitest';

export function json(status, body) {
    return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    });
}

export function fakeTasksApi(initial = []) {
    let tasks = initial.map(t => ({ done_at: null, ...t }));
    let nextId = Math.max(0, ...tasks.map(t => t.id)) + 1;
    const requests = [];
    // set to make the next requests fail: a status code, or 'network'
    const failures = [];

    async function handle(url, init = {}) {
        const method = init.method ?? 'GET';
        const body = init.body ? JSON.parse(init.body) : undefined;
        requests.push({ method, url, body });

        const failure = failures.shift();
        if (failure === 'network') throw new TypeError('Failed to fetch');
        if (failure) return json(failure, { error: { message: `Failed with ${failure}`, details: [] } });

        const [path, search] = url.split('?');
        const id = Number(path.split('/')[3]);
        if (method === 'GET' && path === '/api/tasks') {
            const done = new URLSearchParams(search).get('done');
            const rows = done === 'false' ? tasks.filter(t => !t.done_at) : tasks;
            return json(200, rows);
        }
        if (method === 'POST' && path === '/api/tasks') {
            const task = { id: nextId++, name: body.name, done_at: null };
            tasks.push(task);
            return json(201, task);
        }
        const task = tasks.find(t => t.id === id);
        if (!task) return json(404, { error: { message: `There's no task ${id}`, details: [] } });
        if (method === 'PATCH') {
            Object.assign(task, body);
            return json(200, { ...task });
        }
        if (method === 'DELETE') {
            tasks = tasks.filter(t => t !== task);
            return json(204);
        }
        return json(404, { error: { message: 'No such route', details: [] } });
    }

    return {
        requests,
        get tasks() {
            return tasks;
        },
        failNext(...kinds) {
            failures.push(...kinds);
        },
        install() {
            vi.stubGlobal('fetch', vi.fn(handle));
        },
        writes() {
            return requests.filter(r => r.method !== 'GET');
        },
    };
}
