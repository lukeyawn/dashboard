import { addDays, daysBetween, today } from '../../../shared/dates';
import { chooseCountdown, countdownNumber } from './countdown';
import { useNow } from '../../hooks/useNow';
import ClaudeMark from '../../components/ClaudeMark';
import EditButton from '../../components/EditButton';
import { CountdownsEditor } from '../../editors/editors';
import { useResource } from '../../hooks/useResource';
import './CountdownWidget.css';

export default function CountdownWidget() {
    const todayDate = today(useNow());
    const countdowns = useResource('countdowns');
    const birthdays = useResource('birthdays', { params: { from: todayDate, to: addDays(todayDate, 7) } });

    if (countdowns.loading) return <div className="countdown-widget" />;
    const chosen = chooseCountdown({ todayDate, countdowns: countdowns.data ?? [], birthdays: birthdays.data ?? [] });
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

    const { number, unit } = countdownNumber(daysBetween(todayDate, chosen.date));
    return (
        <div className="countdown-widget">
            {edit}
            <p className={unit ? 'countdown-number' : 'countdown-number today'}>{number}</p>
            <p className="countdown-label">{unit ? `${unit} until ${chosen.label}` : chosen.label}</p>
        </div>
    );
}
