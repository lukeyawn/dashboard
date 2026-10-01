// All HTTP goes through here; widgets never call fetch directly (DESIGN §6).

export class ApiError extends Error {
    constructor(status, message, details = []) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

const unauthorizedListeners = new Set();

// Called whenever the server says the browser isn't logged in. Returns an unsubscribe function.
export function onUnauthorized(listener) {
    unauthorizedListeners.add(listener);
    return () => unauthorizedListeners.delete(listener);
}

// fetch only rejects when the network fails; a 404 or 500 still "succeeds", so
// every response is checked (DESIGN §4)
export async function request(path, { method = 'GET', body, signal } = {}) {
    let res;
    try {
        res = await fetch(`/api${path}`, {
            method,
            signal,
            credentials: 'same-origin',
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        throw new ApiError(0, "Can't reach the server");
    }

    if (res.status === 401) unauthorizedListeners.forEach(listener => listener());
    if (!res.ok) {
        const error = await res.json().then(json => json?.error, () => null);
        throw new ApiError(res.status, error?.message ?? `The server answered ${res.status}`, error?.details);
    }
    return res.status === 204 ? null : res.json();
}

export function query(params = {}) {
    const entries = Object.entries(params).filter(([, value]) => value !== undefined);
    return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
}

export function logIn(token) {
    return request('/login', { method: 'POST', body: { token } });
}
