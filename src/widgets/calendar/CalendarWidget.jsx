import { formatDate, today } from '../../../shared/dates';
import { useNow } from '../../hooks/useNow';
import { useResource } from '../../hooks/useResource';
import './CalendarWidget.css';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Today, and this month with a dot on days that have a deadline, a countdown
// or a birthday (DESIGN §10, Calendar). Regular events aren't dotted: weekly
// classes would dot every weekday.
export default function CalendarWidget() {
    const now = useNow();
    const todayDate = today(now);
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthStart = formatDate(new Date(year, month, 1));
    const monthEnd = formatDate(new Date(year, month, daysInMonth));

    const deadlines = useResource('deadlines', { params: { done: false } });
    const countdowns = useResource('countdowns');
    const birthdays = useResource('birthdays', { params: { from: monthStart, to: monthEnd } });
    const marked = new Set([
        ...(deadlines.data ?? []).filter(d => !d.done_at).map(d => d.due),
        ...(countdowns.data ?? []).map(c => c.target_date),
        ...(birthdays.data ?? []).map(b => b.date),
    ]);

    // leading nulls pad the first week so day 1 lands under the right weekday
    const cells = [
        ...Array(firstWeekday).fill(null),
        ...Array.from({length: daysInMonth}, (_, i) => formatDate(new Date(year, month, i + 1))),
    ];

    return (
        <div className="widget calendar-widget">
            <div className="calendar-today">
                <div className="calendar-weekday">{now.toLocaleDateString('en-US', {weekday: 'long'})}</div>
                <div className="calendar-day">{now.getDate()}</div>
                <div className="calendar-month">{now.toLocaleDateString('en-US', {month: 'long', year: 'numeric'})}</div>
            </div>
            <div className="calendar-grid">
                {WEEKDAYS.map((d, i) => <div key={`heading-${i}`} className="calendar-heading">{d}</div>)}
                {cells.map((date, i) => {
                    const classes = ['calendar-cell', date === todayDate && 'today', marked.has(date) && 'marked'].filter(Boolean).join(' ');
                    return (
                        <div key={date ?? `pad-${i}`} className={classes} data-date={date ?? undefined}>
                            <span>{date ? Number(date.slice(8)) : ''}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
