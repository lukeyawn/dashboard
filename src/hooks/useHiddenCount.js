import { useLayoutEffect, useState } from 'react';

// How many items to hide so the rest fit in ref's element, which clips what
// overflows. Starts from 0 whenever key changes (the items, or how they look),
// then hides one more after each render that still overflows, up to max. The
// widget chooses which items go: Today's earliest past events, or the last
// events of an Upcoming day.
export function useHiddenCount(ref, key, max) {
    const [hidden, setHidden] = useState({ key, count: 0 });
    const count = hidden.key === key ? hidden.count : 0;

    useLayoutEffect(() => {
        const el = ref.current;
        if (el && count < max && el.scrollHeight > el.clientHeight + 1) {
            setHidden({ key, count: count + 1 });
        }
    }, [ref, key, count, max]);

    return count;
}
