import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

// True once nobody has touched the screen for ms (DESIGN §6.4). Touches on
// anything marked data-ignore-idle don't count: the night overlay wakes the
// page itself, once its tap is over (see NightOverlay). wake() counts as a touch.
export function useIdle(ms) {
    const [idle, setIdle] = useState(false);
    const timer = useRef(null);

    const wake = useCallback(event => {
        if (event?.target?.closest?.('[data-ignore-idle]')) return;
        setIdle(false);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setIdle(true), ms);
    }, [ms]);

    useEffect(() => {
        timer.current = setTimeout(() => setIdle(true), ms);
        ACTIVITY.forEach(type => window.addEventListener(type, wake, { capture: true, passive: true }));
        return () => {
            clearTimeout(timer.current);
            ACTIVITY.forEach(type => window.removeEventListener(type, wake, { capture: true }));
        };
    }, [ms, wake]);

    return { idle, wake };
}
