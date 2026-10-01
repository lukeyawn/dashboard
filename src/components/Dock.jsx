import { useNow } from '../hooks/useNow';
import './Dock.css';

function timeParts(now) {
    const parts = new Intl.DateTimeFormat('en-US', {hour: 'numeric', minute: '2-digit'}).formatToParts(now);
    const period = parts.find(p => p.type === 'dayPeriod')?.value ?? '';
    const time = parts.filter(p => p.type !== 'dayPeriod').map(p => p.value).join('').trim();
    return { time, period };
}

export default function Dock() {
    const now = useNow(1000);
    const { time, period } = timeParts(now);

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
            <div className="dock-weather" />
        </div>
    );
}
