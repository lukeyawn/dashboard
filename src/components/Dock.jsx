import { useOfflineSince } from '../hooks/useConnection';
import { useNow } from '../hooks/useNow';
import { useWeather } from '../hooks/useWeather';
import { formatTime } from '../lib/format';
import './Dock.css';

function timeParts(now) {
    const parts = new Intl.DateTimeFormat('en-US', {hour: 'numeric', minute: '2-digit'}).formatToParts(now);
    const period = parts.find(p => p.type === 'dayPeriod')?.value ?? '';
    const time = parts.filter(p => p.type !== 'dayPeriod').map(p => p.value).join('').trim();
    return { time, period };
}

// The clock, the date and the weather (DESIGN §10, Dock), a note when the
// server can't be reached, and the moon button that starts night mode (§6.4)
export default function Dock({ night, onMoon }) {
    const now = useNow(1000);
    const { time, period } = timeParts(now);
    const offlineSince = useOfflineSince();

    return (
        <div className="dock">
            <div className="dock-clock">
                <time className="dock-time" dateTime={now.toISOString()}>
                    {time}<span className="dock-period">{period}</span>
                </time>
                <span className="dock-date">
                    {now.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'})}
                </span>
            </div>
            <div className="dock-right">
                {offlineSince && <span className="dock-offline" role="status">offline since {formatTime(offlineSince)}</span>}
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
