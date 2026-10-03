import { useState } from 'react';
import AgentChanges from '../agent/AgentChanges';
import { useAgentChanges } from '../agent/useAgentChanges';
import { useOfflineSince } from '../hooks/useConnection';
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
// server can't be reached or a background job is failing, the chip for what
// the agent changed (docs/AGENT.md §3), and the moon button that starts
// night mode (§6.4, §5.5)
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
            <div className="dock-right">
                {offlineSince && <span className="dock-offline" role="status">offline since {formatTime(offlineSince)}</span>}
                {!offlineSince && problems.map(p => <span key={p.kind} className="dock-offline dock-problem" role="status">{p.message}</span>)}
                <AgentChip />
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

// "✦ 5 new from the agent", only while there's something new; tapping it
// lists the changes, and closing that clears the chip on every screen
function AgentChip() {
    const { unseen, markSeen, refresh } = useAgentChanges();
    // the changes as they were when the chip was tapped, so a poll can't
    // move a row out from under a finger
    const [open, setOpen] = useState(null);

    function close() {
        markSeen(open.map(c => c.at).sort().at(-1));
        setOpen(null);
        refresh();
    }

    if (unseen.length === 0 && !open) return null;
    return (
        <>
            {unseen.length > 0 && (
                <button type="button" className="dock-agent" data-tap onClick={() => setOpen(unseen)}>
                    ✦ {unseen.length}{unseen.length >= 200 ? '+' : ''} new from the agent
                </button>
            )}
            {open && <AgentChanges changes={open} onClose={close} />}
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
