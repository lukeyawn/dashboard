import { useCallback, useState } from 'react';
import AgentTimeline from '../agent/AgentTimeline';
import { useAgentChanges } from '../agent/useAgentChanges';
import { IDLE_MS } from '../config';
import { useOfflineSince } from '../hooks/useConnection';
import { useIdle } from '../hooks/useIdle';
import { useIsKiosk } from '../hooks/useKiosk';
import { useResource } from '../hooks/useResource';
import { useNow } from '../hooks/useNow';
import { useWeather } from '../hooks/useWeather';
import { formatTime } from '../lib/format';
import './Dock.css';

function timeParts(now) {
    const parts = new Intl.DateTimeFormat('en-US', {hour: 'numeric', minute: '2-digit'}).formatToParts(now);
    const period = parts.find(p => p.type === 'dayPeriod')?.value ?? '';
    const time = parts.filter(p => p.type !== 'dayPeriod').map(p => p.value).join('').trim();
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return { time, seconds, period };
}

// The clock, the date and the weather (DESIGN §10, Dock), a note when the
// server can't be reached or a background job is failing, the agent's ✦ in
// the middle (docs/AGENT.md §7), and the moon button that starts night mode
// (§6.4, §5.5)
export default function Dock({ night, onMoon }) {
    const now = useNow(1000);
    const { time, seconds, period } = timeParts(now);
    const offlineSince = useOfflineSince();
    // backups and the calendar feed; only a problem is shown (DESIGN §5.5)
    const status = useResource('status', { pollMs: 5 * 60 * 1000 });
    const problems = status.data?.problems ?? [];

    return (
        <div className="dock">
            <div className="dock-clock">
                <time className="dock-time" dateTime={now.toISOString()}>
                    {time}
                    {/* small and muted, so they don't pull the eye (BLOCKS.md §8) */}
                    <span className="dock-time-side">
                        <span className="dock-seconds">{seconds}</span>
                        <span className="dock-period">{period}</span>
                    </span>
                </time>
                <span className="dock-date">
                    {now.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'})}
                </span>
            </div>
            <div className="dock-center">
                <AgentCenter />
            </div>
            <div className="dock-right">
                {offlineSince && <span className="dock-offline" role="status">offline since {formatTime(offlineSince)}</span>}
                {!offlineSince && problems.map(p => <span key={p.kind} className="dock-offline dock-problem" role="status">{p.message}</span>)}
                <Weather />
                {onMoon && (
                    <button
                        type="button"
                        className={night?.early ? 'dock-moon on' : 'dock-moon'}
                        data-tap
                        aria-pressed={Boolean(night?.early)}
                        aria-label={night?.early ? 'Cancel night mode' : 'Start night mode now'}
                        onClick={onMoon}
                    >
                        ☾
                    </button>
                )}
            </div>
        </div>
    );
}

// The agent's ✦ (docs/AGENT.md §7): nothing of what it did shows until it's
// tapped. "5 new" sits beside it while there's something Luke hasn't seen;
// it's muted otherwise, and gone after a few quiet days. Tapping it opens the
// timeline, and closing that marks everything in it seen, on every screen.
// On the kiosk it closes itself after IDLE_MS without a touch, without
// marking anything seen, since nobody may have read it.
function AgentCenter() {
    const { entries, newCount, seenUpTo, markSeen, refresh } = useAgentChanges();
    const isKiosk = useIsKiosk();
    const { idle } = useIdle(IDLE_MS);
    // the timeline as it was when the ✦ was tapped, so a poll can't move a
    // row out from under a finger
    const [open, setOpen] = useState(null);
    // set while rendering, when idle starts, rather than in an effect
    const [wasIdle, setWasIdle] = useState(idle);
    if (idle !== wasIdle) {
        setWasIdle(idle);
        if (idle && isKiosk && open) setOpen(null);
    }

    const close = useCallback(() => {
        markSeen(open.seenUpTo);
        setOpen(null);
        refresh();
    }, [open, markSeen, refresh]);

    if (entries.length === 0 && !open) return null;
    return (
        <>
            <button
                type="button"
                className={newCount > 0 ? 'dock-agent new' : 'dock-agent'}
                data-tap
                aria-label={newCount > 0 ? `The agent: ${newCount} new` : 'The agent'}
                onClick={() => setOpen({ entries, seenUpTo })}
            >
                ✦{newCount > 0 && <span className="dock-agent-count">{newCount}{newCount >= 200 ? '+' : ''} new</span>}
            </button>
            {open && <AgentTimeline entries={open.entries} onClose={close} />}
        </>
    );
}

function Weather() {
    const weather = useWeather();
    const w = weather.data;
    if (!w) return null;
    return (
        <div className="dock-weather">
            <span className="dock-temperature">{w.temperature}°</span>
            <span className="dock-weather-detail">
                <span>{w.condition}</span>
                <span className="dock-muted">
                    H {w.high}° · L {w.low}°{w.location.name && ` · ${w.location.name}`}
                </span>
            </span>
        </div>
    );
}
