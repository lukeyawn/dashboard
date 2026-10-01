import { addDays, daysBetween, today } from '../../../shared/dates';
import { chooseCountdown, countdownNumber } from './countdown';
import { useNow } from '../../hooks/useNow';
import { useResource } from '../../hooks/useResource';
import './CountdownWidget.css';

export default function CountdownWidget() {
    const todayDate = today(useNow());
    const countdowns = useResource('countdowns');
    const birthdays = useResource('birthdays', { params: { from: todayDate, to: addDays(todayDate, 7) } });

    if (countdowns.loading) return <div className="countdown-widget" />;
    const chosen = chooseCountdown({ todayDate, countdowns: countdowns.data ?? [], birthdays: birthdays.data ?? [] });
    if (!chosen) {
        return (
            <div className="countdown-widget">
                <p className="countdown-label">{countdowns.data ? 'No countdowns' : "Couldn't load countdowns"}</p>
            </div>
        );
    }

    const { number, unit } = countdownNumber(daysBetween(todayDate, chosen.date));
    return (
        <div className="countdown-widget">
            <p className={unit ? 'countdown-number' : 'countdown-number today'}>{number}</p>
            <p className="countdown-label">{unit ? `${unit} until ${chosen.label}` : chosen.label}</p>
        </div>
    );
}
