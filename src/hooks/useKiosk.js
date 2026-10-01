import { useEffect, useState, useSyncExternalStore } from 'react';
import { NIGHTLY_RELOAD } from '../config';
import { getServerBuild, onServerBuild } from '../lib/api';
import { useNow } from './useNow';
import { useResource } from './useResource';

// Whether this browser is the kiosk: it logged in with the kiosk token
export function useIsKiosk() {
    const session = useResource('session', { pollMs: 60 * 60 * 1000 });
    return session.data?.client === 'kiosk';
}

// The next time the clock reads hh:mm after `from`
export function nextTimeOfDay(from, hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const next = new Date(from.getFullYear(), from.getMonth(), from.getDate(), h, m);
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
}

// Reload only once the server answers, so a working page is never swapped
// for an error page while offline (DESIGN §6.4)
export async function reloadWhenReachable(reload = () => window.location.reload()) {
    try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok) reload();
    } catch {
        // offline: try again at the next chance
    }
}

// The kiosk's reload rules (DESIGN §6.4): after a deploy, at the next idle
// moment; and nightly around 04:00. `build` is this page's own build.
export function useReloadRules({ enabled, idle, build = __BUILD__, reload }) {
    const now = useNow();
    const serverBuild = useSyncExternalStore(onServerBuild, getServerBuild);
    const [nightly] = useState(() => nextTimeOfDay(new Date(), NIGHTLY_RELOAD));

    const deployed = Boolean(serverBuild) && serverBuild !== build && build !== 'dev';
    const due = (deployed && idle) || now >= nightly;

    useEffect(() => {
        if (enabled && due) reloadWhenReachable(reload);
    }, [enabled, due, now, reload]);
}
