// The public listener (docs/CONNECTOR.md §3): the only thing Tailscale Funnel
// exposes to the internet. A separate Express app on its own port, so it
// mounts nothing but the MCP endpoint, the sign-in routes and their metadata.
// There's no /api, no pages and no static files here, so a routing mistake
// in the private app can't make them public.
import express from 'express';
import { errorHandler } from './errors.js';
import { createRateLimiter, visitorOf } from './limits.js';
import { RESOURCE_PATHS } from './oauth.js';

const MINUTE = 60 * 1000;
const fail = (res, status, message) => res.status(status).json({ error: { message, details: [] } });

// oauth:       from createOAuth (server/oauth.js)
// connections: the connection store, to check access tokens
// handleMcp:   from createMcpHandler (server/mcp.js)
// log:         one line per request, for the journal, with the visitor's
//              address (from Funnel's X-Forwarded-For); never bodies or tokens
export function createPublicApp({ oauth, connections, handleMcp, publicUrl, now = Date.now, log = console.log }) {
    const app = express();
    app.disable('x-powered-by');

    // limits split by kind, so strangers can't spend claude.ai's share (§4)
    const perConnection = createRateLimiter({ limit: 120, windowMs: MINUTE, now });
    const unknownByVisitor = createRateLimiter({ limit: 60, windowMs: MINUTE, now });
    const unknownOverall = createRateLimiter({ limit: 600, windowMs: MINUTE, now });

    app.use((req, res, next) => {
        res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
        res.on('finish', () => log(`public ${req.method} ${req.path} ${res.statusCode} from=${visitorOf(req)} connection=${res.locals.connection ?? '-'} tool=${res.locals.tool ?? '-'}`));
        next();
    });

    app.use(oauth.publicRouter());

    // The token is checked before anything else, before the body is even
    // read: junk costs almost nothing and never reaches MCP or a tool.
    const requireConnection = connector => (req, res, next) => {
        // claude.ai's servers send no Origin; a browser page would
        if (req.get('origin')) return fail(res, 403, 'Browser requests are not accepted here');
        const header = req.get('authorization');
        const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
        const connection = connections.verifyAccess(token);
        if (!connection || connection.connector !== connector) {
            if (!unknownByVisitor.allow(visitorOf(req)) || !unknownOverall.allow()) return fail(res, 429, 'Too many requests');
            const metadata = `${publicUrl}/.well-known/oauth-protected-resource${RESOURCE_PATHS[connector]}`;
            res.set('WWW-Authenticate', `Bearer resource_metadata="${metadata}"${token ? ', error="invalid_token"' : ''}`);
            return fail(res, 401, 'Sign in through claude.ai first');
        }
        res.locals.connection = connection.id;
        if (!perConnection.allow(connection.id)) return fail(res, 429, 'Too many requests. Try again in a minute.');
        req.accessToken = token;
        next();
    };

    // stateless: no server-sent event streams and no sessions to end
    const postOnly = (req, res, next) => {
        if (req.method === 'POST') return next();
        res.set('Allow', 'POST');
        fail(res, 405, 'Only POST is supported');
    };

    const noteTool = (req, res, next) => {
        if (req.body?.method === 'tools/call') res.locals.tool = String(req.body.params?.name ?? '?').slice(0, 60);
        next();
    };

    for (const connector of oauth.connectors()) {
        app.all(RESOURCE_PATHS[connector], requireConnection(connector), postOnly, express.json({ limit: '64kb' }), noteTool,
            (req, res, next) => handleMcp(req, res, connector).catch(next));
    }

    app.use((req, res) => fail(res, 404, 'Not found'));
    app.use(errorHandler);
    return app;
}
