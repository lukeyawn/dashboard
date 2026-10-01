// Whether night mode is in force (DESIGN §6.4). The server is the only judge;
// the page and the Pi's display script both ask it.

function minutesOf(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

// Night hours wrap past midnight when the start is later than the end:
// 22:00–06:30 means now >= start || now < end (DESIGN §14)
export function inNightHours(now, start, end) {
    const minute = now.getHours() * 60 + now.getMinutes();
    const s = minutesOf(start);
    const e = minutesOf(end);
    if (s === e) return false;
    return s < e ? minute >= s && minute < e : minute >= s || minute < e;
}

// the next time the clock reads `end`: today if that's still ahead, otherwise tomorrow
export function nextEnd(now, end) {
    const [h, m] = end.split(':').map(Number);
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
}

export function nightState(now, { night_start: start, night_end: end, night_early_until: earlyUntil }) {
    const early = Boolean(earlyUntil) && now < new Date(earlyUntil);
    const active = early || inNightHours(now, start, end);
    return {
        active,
        // whether it was started early, so there's something to cancel
        early,
        until: active ? (early ? earlyUntil : nextEnd(now, end).toISOString()) : null,
        start,
        end,
    };
}
