import { useState } from 'react';
import { addDays, today } from '../../../shared/dates';
import { chooseCountdown, clockEms, clockParts, countdownDisplay, needsSeconds } from './countdown';
import { useNow } from '../../hooks/useNow';
import ClaudeMark from '../../components/ClaudeMark';
import EditButton from '../../components/EditButton';
import { CountdownsEditor } from '../../editors/editors';
import { useResource } from '../../hooks/useResource';
import './CountdownWidget.css';

export default function CountdownWidget() {
    // ticks every minute, and every second during a live countdown's last day (docs/BLOCKS.md §4)
    const [seconds, setSeconds] = useState(false);
    const now = useNow(seconds ? 1000 : 60_000);
    const todayDate = today(now);
    const countdowns = useResource('countdowns');
    const birthdays = useResource('birthdays', { params: { from: todayDate, to: addDays(todayDate, 7) } });
    const chosen = chooseCountdown({ todayDate, countdowns: countdowns.data ?? [], birthdays: birthdays.data ?? [] });
    // adjusted while rendering, as React suggests for state that follows other values
    const wantSeconds = Boolean(chosen && needsSeconds(chosen, now));
    if (wantSeconds !== seconds) setSeconds(wantSeconds);

    if (countdowns.loading) return <div className="countdown-widget" />;
    const edit = (
        <div className="widget-corner">
            {chosen?.claude_change && <ClaudeMark change={chosen.claude_change} name={chosen.label} onUndone={countdowns.refresh} />}
            <EditButton title="Countdowns" editor={CountdownsEditor} onClosed={countdowns.refresh} />
        </div>
    );
    if (!chosen) {
        return (
            <div className="countdown-widget">
                {edit}
                <p className="countdown-label">{countdowns.data ? 'No countdowns' : "Couldn't load countdowns"}</p>
            </div>
        );
    }

    const { number, unit, kind } = countdownDisplay(chosen, now);
    // the last minute's seconds fill the tile alone
    if (kind === 'seconds') {
        return (
            <div className="countdown-widget">
                {edit}
                <p className="countdown-number seconds" aria-label={`${number} seconds until ${chosen.label}`}>{number}</p>
            </div>
        );
    }
    if (kind === 'clock') {
        const { main, seconds } = clockParts(number);
        return (
            <div className="countdown-widget">
                {edit}
                <p className="countdown-number clock" style={{ '--ems': clockEms(number) }} aria-label={number}>
                    {main}{seconds && <span className="countdown-clock-seconds">{seconds}</span>}
                </p>
                <p className="countdown-label">until {chosen.label}</p>
            </div>
        );
    }
    const className = unit ? 'countdown-number' : 'countdown-number today';
    return (
        <div className="countdown-widget">
            {edit}
            <p className={className}>{number}</p>
            <p className="countdown-label">{unit ? `${unit} until ${chosen.label}` : chosen.label}</p>
        </div>
    );
}
