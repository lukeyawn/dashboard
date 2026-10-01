import './CalendarWidget.css';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CalendarWidget({date = new Date()}) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // leading nulls pad the first week so day 1 lands under the right weekday
    const cells = [
        ...Array(firstWeekday).fill(null),
        ...Array.from({length: daysInMonth}, (_, i) => i + 1),
    ];

    return (
        <div className="widget calendar-widget">
            <div className="calendar-today">
                <div className="calendar-weekday">{date.toLocaleDateString('en-US', {weekday: 'long'})}</div>
                <div className="calendar-day">{date.getDate()}</div>
                <div className="calendar-month">{date.toLocaleDateString('en-US', {month: 'long', year: 'numeric'})}</div>
            </div>
            <div className="calendar-grid">
                {WEEKDAYS.map((d, i) => <div key={`heading-${i}`} className="calendar-heading">{d}</div>)}
                {cells.map((day, i) => (
                    <div key={i} className={day === date.getDate() ? 'calendar-cell today' : 'calendar-cell'}>
                        <span>{day}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
