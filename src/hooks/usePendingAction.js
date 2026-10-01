import { useCallback, useEffect, useRef, useState } from 'react';
import { PENDING_MS } from '../config';

// A tap that completes or removes something waits delayMs before it happens,
// and tapping again cancels it (DESIGN §6.2). The request is sent at the end,
// so cancelling needs no second request.
export function usePendingAction(action, delayMs = PENDING_MS) {
    const [pending, setPending] = useState(() => new Set());
    const timers = useRef(new Map());
    const latestAction = useRef(action);

    useEffect(() => {
        latestAction.current = action;
    });

    const toggle = useCallback(id => {
        const running = timers.current.get(id);
        if (running) {
            clearTimeout(running);
            timers.current.delete(id);
            setPending(prev => without(prev, id));
            return;
        }
        timers.current.set(id, setTimeout(() => {
            timers.current.delete(id);
            setPending(prev => without(prev, id));
            latestAction.current(id);
        }, delayMs));
        setPending(prev => new Set(prev).add(id));
    }, [delayMs]);

    // leaving the page drops anything still pending, which the design accepts
    useEffect(() => {
        const running = timers.current;
        return () => {
            running.forEach(clearTimeout);
            running.clear();
        };
    }, []);

    const isPending = useCallback(id => pending.has(id), [pending]);
    return { isPending, toggle, delayMs };
}

function without(set, id) {
    const next = new Set(set);
    next.delete(id);
    return next;
}
