// Sign-in for the claude.ai connectors: OAuth 2.1 as the MCP authorization
// spec describes it (docs/CONNECTOR.md §4). The server is both the protected
// resource and the authorization server, on the public listener's origin.
//
// The public half shows no page and asks for no secret: /oauth/authorize
// checks the request and redirects the browser to an approval page on the
// tailnet, which needs the owner's login and the browser that started the
// request (a cookie set here and read there). The tailnet half is the approval
// API under /api/connect.
import crypto from 'node:crypto';
import express from 'express';
import { parseCookies } from './auth.js';
import { HttpError } from './errors.js';
import { createLockout, createRateLimiter, visitorOf } from './limits.js';
import { RefreshError } from './stores/connections.js';

export const REDIRECT_URIS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];
export const RESOURCE_PATHS = { chat: '/mcp', agent: '/mcp/agent' };
export const PENDING_TTL_MS = 5 * 60 * 1000;
export const CODE_TTL_MS = 60 * 1000;
export const MAX_PENDING = 10;

// what each connector will be able to do, as the approval page says it
export const ACCESS = {
    chat: 'Read your dashboard, and add and change tasks, countdowns, goals, habits and job applications. It can\'t delete anything, and everything it does is listed under Claude\'s changes on /manage, with Undo.',
    agent: 'Read your dashboard, and suggest changes for you to accept or dismiss.',
};

const MINUTE = 60 * 1000;
const hash = text => crypto.createHash('sha256').update(text).digest();
const random = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sameSecret = (a, b) => typeof a === 'string' && crypto.timingSafeEqual(hash(a), hash(b));
const s256 = verifier => crypto.createHash('sha256').update(verifier).digest('base64url');
export const connectCookie = id => `dashboard_connect_${id}`;

function withParams(base, params) {
    const url = new URL(base);
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, value);
    return url.toString();
}

// connections:  the store (server/stores/connections.js)
// publicUrl:    the public listener's origin, e.g. https://dashboard.<tailnet>.ts.net
// tailnetUrl:   the dashboard's own origin, where the approval page is, e.g.
//               https://dashboard.<tailnet>.ts.net:8443
// clients:      { chat: { id, secret }, agent?: { id, secret } }
// isEnabled:    connector => whether its kill switch is on
export function createOAuth({ connections, publicUrl, tailnetUrl, clients, isEnabled = () => true, now = Date.now }) {
    const configured = Object.entries(clients).filter(([, client]) => client?.id && client?.secret);
    const connectorOf = clientId => configured.find(([, client]) => client.id === clientId)?.[0] ?? null;
    const resourceOf = connector => publicUrl + RESOURCE_PATHS[connector];
    const enabled = connector => Boolean(clients[connector]?.id) && isEnabled(connector);

    // sign-ins waiting for approval, and codes waiting to be redeemed; both
    // short-lived, so they live in memory and a restart simply clears them
    const pending = new Map();
    const codes = new Map();

    function sweep() {
        const time = now();
        for (const [id, request] of pending) if (request.expires <= time) pending.delete(id);
        for (const [key, code] of codes) if (code.expires <= time) codes.delete(key);
    }

    function pendingRequest(id) {
        sweep();
        const request = pending.get(id);
        if (!request) throw new HttpError(404, 'This sign-in has expired or was already used. Start again from claude.ai.');
        return request;
    }

    // per visitor, so a stranger can only use up their own share (docs/CONNECTOR.md §4)
    const authorizeLimit = createRateLimiter({ limit: 20, windowMs: 10 * MINUTE, now });
    const tokenLimit = createRateLimiter({ limit: 30, windowMs: MINUTE, now });
    const wrongSecretByVisitor = createLockout({ failures: 10, windowMs: 15 * MINUTE, now });
    const wrongSecretOverall = createLockout({ failures: 30, windowMs: 15 * MINUTE, now });

    function protectedResource(connector) {
        return (req, res) => res.json({
            resource: resourceOf(connector),
            authorization_servers: [publicUrl],
            bearer_methods_supported: ['header'],
            resource_name: connector === 'chat' ? 'Dashboard' : 'Dashboard (suggest only)',
        });
    }

    function authorize(req, res) {
        if (!authorizeLimit.allow(visitorOf(req))) return res.status(429).type('text').send('Too many sign-in attempts. Try again in a few minutes.');
        const q = Object.fromEntries(Object.entries(req.query).map(([key, value]) => [key, typeof value === 'string' ? value : undefined]));
        const connector = connectorOf(q.client_id);
        // with an unknown client or redirect address there's nowhere safe to send an error
        if (!connector || !REDIRECT_URIS.includes(q.redirect_uri)) {
            return res.status(400).type('text').send('Unknown client, or a redirect address that isn\'t allowed.');
        }
        const fail = (error, description) => res.redirect(302, withParams(q.redirect_uri, { error, error_description: description, state: q.state }));
        if (q.response_type !== 'code') return fail('unsupported_response_type', 'Only the code flow is supported');
        if (q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(q.code_challenge ?? '')) {
            return fail('invalid_request', 'A PKCE S256 code_challenge is required');
        }
        if (q.state !== undefined && q.state.length > 1000) return fail('invalid_request', 'state is too long');
        // the client decides the access; resource, when sent, must agree with it
        if (q.resource !== undefined && q.resource !== resourceOf(connector)) return fail('invalid_target', `This client signs in to ${resourceOf(connector)}`);
        if (!enabled(connector)) return fail('access_denied', 'This connector is switched off on the dashboard');

        sweep();
        // a new sign-in pushes out the oldest, so a flood can't block yours
        while (pending.size >= MAX_PENDING) pending.delete(pending.keys().next().value);
        const id = random(18);
        const nonce = random();
        pending.set(id, {
            connector,
            redirectUri: q.redirect_uri,
            state: q.state,
            codeChallenge: q.code_challenge,
            nonce: hash(nonce),
            expires: now() + PENDING_TTL_MS,
        });
        // ties the approval to this browser; cookies are shared between ports
        // on one host, so the tailnet page can read it (docs/CONNECTOR.md §4)
        res.cookie(connectCookie(id), nonce, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: PENDING_TTL_MS });
        res.redirect(302, `${tailnetUrl}/connect/${id}`);
    }

    // the client's connector from Basic auth or the body, or null
    function authenticate(req) {
        let id = req.body?.client_id;
        let secret = req.body?.client_secret;
        const header = req.get('authorization');
        if (header?.startsWith('Basic ')) {
            const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString();
            const colon = decoded.indexOf(':');
            if (colon !== -1) {
                try {
                    id = decodeURIComponent(decoded.slice(0, colon));
                    secret = decodeURIComponent(decoded.slice(colon + 1));
                } catch {
                    return null;
                }
            }
        }
        const connector = connectorOf(id);
        return connector && sameSecret(secret, clients[connector].secret) ? connector : null;
    }

    function token(req, res) {
        res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
        const error = (status, code, description) => res.status(status).json({ error: code, error_description: description });
        const visitor = visitorOf(req);
        if (wrongSecretByVisitor.isLocked(visitor) || wrongSecretOverall.isLocked()) {
            return error(429, 'slow_down', 'Too many wrong client secrets. Try again in 15 minutes.');
        }
        const connector = authenticate(req);
        if (!connector) {
            wrongSecretByVisitor.recordFailure(visitor);
            wrongSecretOverall.recordFailure();
            return error(401, 'invalid_client', 'Unknown client or wrong client secret');
        }
        if (!tokenLimit.allow(connector)) return error(429, 'slow_down', 'Too many requests. Try again in a minute.');
        if (!enabled(connector)) return error(400, 'invalid_grant', 'This connector is switched off on the dashboard');
        const { grant_type: grantType, resource } = req.body ?? {};
        if (resource !== undefined && resource !== resourceOf(connector)) return error(400, 'invalid_target', `This client signs in to ${resourceOf(connector)}`);

        let issued;
        if (grantType === 'authorization_code') {
            const { code, redirect_uri: redirectUri, code_verifier: verifier } = req.body;
            if (typeof code !== 'string' || typeof verifier !== 'string') return error(400, 'invalid_request', 'code and code_verifier are required');
            sweep();
            const key = hash(code).toString('hex');
            const entry = codes.get(key);
            // single use, whatever happens next
            codes.delete(key);
            if (!entry || entry.connector !== connector || entry.redirectUri !== redirectUri || s256(verifier) !== entry.codeChallenge) {
                return error(400, 'invalid_grant', 'That code is invalid, expired or already used');
            }
            issued = connections.create(connector);
        } else if (grantType === 'refresh_token') {
            try {
                issued = connections.refresh(req.body.refresh_token, connector);
            } catch (err) {
                if (err instanceof RefreshError) return error(400, 'invalid_grant', err.message);
                throw err;
            }
        } else {
            return error(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
        }
        res.json({
            access_token: issued.accessToken,
            token_type: 'Bearer',
            expires_in: issued.expiresIn,
            refresh_token: issued.refreshToken,
        });
    }

    return {
        resourceOf,
        enabled,
        connectors: () => configured.map(([connector]) => connector),

        // drops waiting sign-ins, as when a connector is switched off
        forgetPending(connector) {
            for (const [id, request] of pending) if (request.connector === connector) pending.delete(id);
        },

        // the public listener's sign-in routes
        publicRouter() {
            const router = express.Router();
            for (const connector of configured.map(([c]) => c)) {
                router.get(`/.well-known/oauth-protected-resource${RESOURCE_PATHS[connector]}`, protectedResource(connector));
            }
            // some clients look at the root first; it describes the chat connector
            if (connectorOf(clients.chat?.id)) router.get('/.well-known/oauth-protected-resource', protectedResource('chat'));
            router.get('/.well-known/oauth-authorization-server', (req, res) => res.json({
                issuer: publicUrl,
                authorization_endpoint: `${publicUrl}/oauth/authorize`,
                token_endpoint: `${publicUrl}/oauth/token`,
                response_types_supported: ['code'],
                grant_types_supported: ['authorization_code', 'refresh_token'],
                code_challenge_methods_supported: ['S256'],
                token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
            }));
            router.get('/oauth/authorize', authorize);
            router.post('/oauth/token', express.urlencoded({ extended: false, limit: '16kb' }), express.json({ limit: '16kb' }), token);
            return router;
        },

        // the tailnet approval API, mounted at /api/connect behind requireToken
        approvalRouter() {
            const router = express.Router();
            const ownerOnly = req => {
                if (req.client !== 'api') throw new HttpError(403, 'Only the owner can approve a connection');
            };
            const sameBrowser = (req, id, request) => {
                const nonce = parseCookies(req.get('cookie'))[connectCookie(id)];
                return typeof nonce === 'string' && crypto.timingSafeEqual(hash(nonce), request.nonce);
            };

            router.get('/:id', (req, res) => {
                ownerOnly(req);
                const request = pendingRequest(req.params.id);
                res.json({
                    connector: request.connector,
                    access: ACCESS[request.connector],
                    expires_at: new Date(request.expires).toISOString(),
                    same_browser: sameBrowser(req, req.params.id, request),
                });
            });

            router.post('/:id/approve', (req, res) => {
                ownerOnly(req);
                const request = pendingRequest(req.params.id);
                if (!sameBrowser(req, req.params.id, request)) {
                    throw new HttpError(403, 'This sign-in was started in a different browser. Only approve a connection you started yourself, in this browser, from claude.ai.');
                }
                if (!enabled(request.connector)) throw new HttpError(409, 'This connector is switched off. Switch it on under Claude on /manage first.');
                pending.delete(req.params.id);
                const code = random();
                codes.set(hash(code).toString('hex'), {
                    connector: request.connector,
                    redirectUri: request.redirectUri,
                    codeChallenge: request.codeChallenge,
                    expires: now() + CODE_TTL_MS,
                });
                res.clearCookie(connectCookie(req.params.id), { path: '/' });
                res.json({ redirect: withParams(request.redirectUri, { code, state: request.state }) });
            });

            router.post('/:id/deny', (req, res) => {
                ownerOnly(req);
                const request = pendingRequest(req.params.id);
                pending.delete(req.params.id);
                res.clearCookie(connectCookie(req.params.id), { path: '/' });
                res.json({ redirect: withParams(request.redirectUri, { error: 'access_denied', state: request.state }) });
            });

            return router;
        },
    };
}

// The connector's settings from .env, checked, or null when PUBLIC_URL isn't
// set (the public listener stays off). Throws a message for anything missing.
export function connectorConfig(env) {
    if (!env.PUBLIC_URL) return null;
    const origin = (name, example) => {
        if (!env[name]) throw new Error(`${name} must be set, such as ${example}`);
        let url;
        try {
            url = new URL(env[name]);
        } catch {
            throw new Error(`${name} must be a full address, such as ${example}`);
        }
        if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
            throw new Error(`${name} must be an https origin with no path, such as ${example}`);
        }
        return url;
    };
    const publicUrl = origin('PUBLIC_URL', 'https://dashboard.<tailnet>.ts.net');
    // claude.ai's servers only connect to port 443 (docs/CONNECTOR.md §3)
    if (publicUrl.port) throw new Error('PUBLIC_URL must have no port, because claude.ai only connects to port 443');
    const tailnetUrl = origin('TAILNET_URL', `https://${publicUrl.hostname}:8443`);
    // the connect cookie only reaches the approval page on the same host
    if (tailnetUrl.hostname !== publicUrl.hostname || tailnetUrl.origin === publicUrl.origin) {
        throw new Error(`TAILNET_URL must be the dashboard's own address: the same host as PUBLIC_URL on another port, such as https://${publicUrl.hostname}:8443`);
    }
    const strong = (name, value) => {
        if (typeof value !== 'string' || value.length < 32) throw new Error(`${name} must be set to at least 32 random characters (vm/oauth-client.sh makes them)`);
        return value;
    };
    const clients = {
        chat: { id: strong('OAUTH_CHAT_CLIENT_ID', env.OAUTH_CHAT_CLIENT_ID), secret: strong('OAUTH_CHAT_CLIENT_SECRET', env.OAUTH_CHAT_CLIENT_SECRET) },
    };
    if (env.OAUTH_AGENT_CLIENT_ID || env.OAUTH_AGENT_CLIENT_SECRET) {
        clients.agent = { id: strong('OAUTH_AGENT_CLIENT_ID', env.OAUTH_AGENT_CLIENT_ID), secret: strong('OAUTH_AGENT_CLIENT_SECRET', env.OAUTH_AGENT_CLIENT_SECRET) };
        if (clients.agent.id === clients.chat.id) throw new Error('The chat and agent clients need different IDs');
    }
    return {
        publicUrl: publicUrl.origin,
        tailnetUrl: tailnetUrl.origin,
        clients,
        refreshKey: strong('OAUTH_REFRESH_KEY', env.OAUTH_REFRESH_KEY),
    };
}
