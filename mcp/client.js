// The MCP server is a thin client over the REST API (DESIGN §5): every tool is
// one HTTP request, so all validation and logic stay in the server.

export class DashboardError extends Error {
    constructor(message, details = []) {
        super(message);
        this.details = details;
    }
}

export function createClient({ baseUrl, token, fetch = globalThis.fetch }) {
    return async function call(method, path, body) {
        let res;
        try {
            res = await fetch(new URL(`/api${path}`, baseUrl), {
                method,
                headers: {
                    authorization: `Bearer ${token}`,
                    // the change record shows these writes as Claude's (DESIGN §5.5)
                    'x-dashboard-client': 'claude',
                    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
                },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: AbortSignal.timeout(15_000),
            });
        } catch (err) {
            throw new DashboardError(`Can't reach the dashboard at ${baseUrl}: ${err.message}. Is this computer on the Tailscale network?`);
        }
        if (res.status === 204) return null;
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new DashboardError(json?.error?.message ?? `The dashboard answered ${res.status}`, json?.error?.details);
        return json;
    };
}

export function query(params) {
    const entries = Object.entries(params).filter(([, value]) => value !== undefined);
    return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
}
