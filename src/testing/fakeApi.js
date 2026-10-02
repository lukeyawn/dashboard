// A fake of the API for frontend tests: install() replaces fetch with an
// in-memory tasks API and records every request. It also answers what the
// Tasks tile reads beside its tasks: the areas, the settings (School, area 1,
// is the assignments area) and the session (a browser, or the kiosk).
import { vi } from 'vitest';

export function json(status, body) {
    return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    });
}

export function fakeTasksApi(initial = [], { areas = [{ id: 1, name: 'School' }, { id: 4, name: 'Home' }], assignmentsArea = 1, client = 'api' } = {}) {
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
        if (method === 'GET' && path === '/api/areas') return json(200, areas);
        if (method === 'GET' && path === '/api/settings') return json(200, { night_start: '22:00', night_end: '06:30', week_start: 'sunday', assignments_area: assignmentsArea });
        if (method === 'GET' && path === '/api/session') return json(200, { client });
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

// A fake API from route handlers, for widget tests. Keys are 'METHOD /api/path',
// with :params; each handler gets { params, query, body } and returns the JSON
// answer, or a Response for anything else. Every request is recorded.
export function fakeServer(routes) {
    const requests = [];
    const failures = [];
    const compiled = Object.entries(routes).map(([key, handler]) => {
        const [method, pattern] = key.split(' ');
        const names = [];
        const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, name) => { names.push(name); return '([^/]+)'; })}$`);
        return { method, regex, names, handler };
    });

    async function handle(url, init = {}) {
        const method = init.method ?? 'GET';
        const body = init.body ? JSON.parse(init.body) : undefined;
        const [path, search = ''] = url.split('?');
        requests.push({ method, url, body });

        const failure = failures.shift();
        if (failure === 'network') throw new TypeError('Failed to fetch');
        if (failure) return json(failure, { error: { message: `Failed with ${failure}`, details: [] } });

        for (const route of compiled) {
            const match = route.method === method && route.regex.exec(path);
            if (!match) continue;
            const params = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(match[i + 1])]));
            const answer = await route.handler({ params, query: new URLSearchParams(search), body });
            return answer instanceof Response ? answer : json(answer === undefined ? 204 : 200, answer);
        }
        return json(404, { error: { message: `No fake for ${method} ${path}`, details: [] } });
    }

    return {
        requests,
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
