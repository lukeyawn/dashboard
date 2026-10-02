import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// How many items to hide so the rest fit in ref's element, which clips what
// overflows. Starts from 0 whenever key changes (the items, or how they look),
// then hides one more after each render that still overflows, up to max. The
// widget chooses which items go: Today's earliest past events, or the last
// events of an Upcoming day.
//
// It starts over, too, when the element changes size or the web fonts finish
// loading: text measured in a fallback font can take less room, so a fit
// worked out before Inter arrived would be cut off.
export function useHiddenCount(ref, key, max) {
    const layout = useLayoutChanges(ref, key);
    const fullKey = `${key}|${layout}`;
    const [hidden, setHidden] = useState({ key: fullKey, count: 0 });
    const count = hidden.key === fullKey ? hidden.count : 0;

    useLayoutEffect(() => {
        const el = ref.current;
        if (el && count < max && el.scrollHeight > el.clientHeight + 1) {
            setHidden({ key: fullKey, count: count + 1 });
        }
    }, [ref, fullKey, count, max]);

    return count;
}

// A number that goes up whenever ref's element changes size, or a font
// finishes loading. key is passed so the size is watched once the element
// appears, such as after a widget's data loads.
function useLayoutChanges(ref, key) {
    const [version, setVersion] = useState(0);
    const size = useRef(null);

    useEffect(() => {
        const el = ref.current;
        let active = true;
        const bump = () => active && setVersion(v => v + 1);

        const fonts = document.fonts;
        fonts?.addEventListener?.('loadingdone', bump);
        if (fonts?.status === 'loading') fonts.ready.then(bump);

        // the first report is the size the fit was just worked out at
        const observer = el && typeof ResizeObserver !== 'undefined' && new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            const last = size.current;
            size.current = { width, height };
            if (last && (last.width !== width || last.height !== height)) bump();
        });
        if (observer) observer.observe(el);

        return () => {
            active = false;
            fonts?.removeEventListener?.('loadingdone', bump);
            if (observer) observer.disconnect();
        };
    }, [ref, key]);

    return version;
}
