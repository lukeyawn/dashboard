// Tokens, the login cookie and the login rate limit (DESIGN §4, Access).
import crypto from 'node:crypto';
import { HttpError } from './errors.js';

export const COOKIE = 'dashboard_token';
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MIN_TOKEN_LENGTH = 32;

export const LOGIN_LIMIT = { failures: 10, windowMs: 15 * 60 * 1000 };

// The server refuses to start with weak or missing tokens. Tokens are long and
// random, so guessing one through the API isn't feasible even without a limit.
export function checkTokens({ apiToken, kioskToken }) {
    for (const [label, token] of [['API_TOKEN', apiToken], ['KIOSK_TOKEN', kioskToken]]) {
        if (typeof token !== 'string' || token.length < MIN_TOKEN_LENGTH) {
            throw new Error(`${label} must be set to at least ${MIN_TOKEN_LENGTH} random characters`);
        }
    }
    if (apiToken === kioskToken) throw new Error('API_TOKEN and KIOSK_TOKEN must be different');
}

function digest(text) {
    return crypto.createHash('sha256').update(text).digest();
}

export function parseCookies(header = '') {
    const cookies = {};
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        const key = part.slice(0, eq).trim();
        try {
            cookies[key] = decodeURIComponent(part.slice(eq + 1).trim());
        } catch {
            // a malformed cookie is ignored, like any other wrong token
        }
    }
    return cookies;
}

// Behind `tailscale serve` every request comes from localhost, so the limit is
// global rather than per address (DESIGN §14).
export function createLoginLimiter({ failures = LOGIN_LIMIT.failures, windowMs = LOGIN_LIMIT.windowMs, now = Date.now } = {}) {
    let recent = [];
    let lockedUntil = 0;

    return {
        isLocked() {
            return now() < lockedUntil;
        },
        recordFailure() {
            const time = now();
            recent = recent.filter(t => time - t < windowMs);
            recent.push(time);
            if (recent.length >= failures) {
                lockedUntil = time + windowMs;
                recent = [];
            }
        },
    };
}

export function createAuth({ apiToken, kioskToken, now = Date.now }) {
    checkTokens({ apiToken, kioskToken });
    const known = [['api', digest(apiToken)], ['kiosk', digest(kioskToken)]];
    const limiter = createLoginLimiter({ now });

    // 'api', 'kiosk' or null. Compares hashes in constant time, and always
    // checks both, so timing reveals nothing about which one nearly matched.
    function identify(token) {
        if (typeof token !== 'string' || token.length === 0) return null;
        const candidate = digest(token);
        let who = null;
        for (const [name, hash] of known) {
            if (crypto.timingSafeEqual(candidate, hash)) who = name;
        }
        return who;
    }

    function tokenFrom(req) {
        const header = req.get('authorization');
        if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
        return parseCookies(req.get('cookie'))[COOKIE] ?? null;
    }

    return {
        identify,

        // Every /api request needs a token, from the cookie or a bearer header
        requireToken(req, res, next) {
            const who = identify(tokenFrom(req));
            if (!who) return next(new HttpError(401, 'Log in first: missing or wrong token'));
            req.client = who;
            next();
        },

        // Checks a token typed at the login screen or carried by the kiosk's
        // login link, and sets the cookie. Throws 429 while locked, 401 if wrong.
        logIn(token, res) {
            if (limiter.isLocked()) throw new HttpError(429, 'Too many failed logins. Try again in 15 minutes.');
            const who = identify(token);
            if (!who) {
                limiter.recordFailure();
                throw new HttpError(401, 'That token is not right');
            }
            res.cookie(COOKIE, token, {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                maxAge: COOKIE_MAX_AGE_MS,
                path: '/',
            });
            return who;
        },
    };
}
