import { useCallback, useEffect, useRef, useState } from 'react';

// Flags that switch themselves off after ms, such as the "undo" shown for 5
// seconds after a goal's +1 (DESIGN §6.2). Showing one again restarts its time.
export function useTimedFlags(ms) {
    const [shown, setShown] = useState(() => new Set());
    const timers = useRef(new Map());

    const hide = useCallback(id => {
        clearTimeout(timers.current.get(id));
        timers.current.delete(id);
        setShown(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const show = useCallback(id => {
        clearTimeout(timers.current.get(id));
        timers.current.set(id, setTimeout(() => hide(id), ms));
        setShown(prev => new Set(prev).add(id));
    }, [ms, hide]);

    useEffect(() => {
        const running = timers.current;
        return () => running.forEach(clearTimeout);
    }, []);

    const isShown = useCallback(id => shown.has(id), [shown]);
    return { isShown, show, hide };
}
