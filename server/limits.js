// Rate limits: the dashboard's login lockout (DESIGN §4, Access), and the split
// limits on the public listener (docs/CONNECTOR.md §4), where each kind of
// traffic gets its own bucket so a stranger can only use up their own share.

export const LOGIN_LIMIT = { failures: 10, windowMs: 15 * 60 * 1000 };

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

// At most `limit` events per key in any `windowMs`. allow(key) counts one
// event and says whether it was within the limit; refused events aren't
// counted, so a key that stops comes back after one window. Keys are
// forgotten once their window has passed, so the map can't grow without end.
export function createRateLimiter({ limit, windowMs, now = Date.now }) {
    const hits = new Map();
    let lastSweep = 0;

    function recent(key, time) {
        const list = (hits.get(key) ?? []).filter(t => time - t < windowMs);
        if (list.length) hits.set(key, list);
        else hits.delete(key);
        return list;
    }

    function sweep(time) {
        if (time - lastSweep < windowMs) return;
        lastSweep = time;
        for (const key of [...hits.keys()]) recent(key, time);
    }

    return {
        allow(key = '') {
            const time = now();
            sweep(time);
            const list = recent(key, time);
            if (list.length >= limit) return false;
            hits.set(key, [...list, time]);
            return true;
        },
    };
}

// Failures per key; once a key has `failures` within `windowMs`, it's locked
// for `windowMs`. Used for wrong client secrets on the public listener.
export function createLockout({ failures, windowMs, now = Date.now }) {
    const recent = new Map();
    const lockedUntil = new Map();

    return {
        isLocked(key = '') {
            const until = lockedUntil.get(key) ?? 0;
            if (now() < until) return true;
            lockedUntil.delete(key);
            return false;
        },
        recordFailure(key = '') {
            const time = now();
            const list = (recent.get(key) ?? []).filter(t => time - t < windowMs);
            list.push(time);
            if (list.length >= failures) {
                lockedUntil.set(key, time + windowMs);
                recent.delete(key);
            } else {
                recent.set(key, list);
            }
        },
    };
}

// The visitor's address on the public listener: the last X-Forwarded-For
// entry, the one Tailscale Funnel adds. Earlier entries are whatever the
// visitor chose to send. Without the header, every visitor shares one bucket.
export function visitorOf(req) {
    const header = req.get('x-forwarded-for');
    const last = header?.split(',').at(-1)?.trim();
    return last || 'unknown';
}
