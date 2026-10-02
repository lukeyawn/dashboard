import { useRef } from 'react';
import { addDays, parseDate, today } from '../../../shared/dates';
import { useHiddenCount } from '../../hooks/useHiddenCount';
import { useNow } from '../../hooks/useNow';
import { useResource } from '../../hooks/useResource';
import { formatTime } from '../../lib/format';
import './UpcomingWidget.css';

// a column per day, each one grid cell wide: part of the layout, not a setting
const DAYS = 4;

// The days after today, starting tomorrow, since Today covers today
// (docs/BLOCKS.md §1). Only events and birthdays: tasks have their own tiles,
// and classes, from the routine calendar, stay on Today. Read-only, like Today.
export default function UpcomingWidget() {
    const todayDate = today(useNow());
    const days = Array.from({length: DAYS}, (_, i) => addDays(todayDate, i + 1));
    const range = { from: days[0], to: days[DAYS - 1] };
    const events = useResource('events', { params: range });
    const birthdays = useResource('birthdays', { params: range });

    let content;
    if (events.loading) content = <p className="widget-message">Loading…</p>;
    else if (!events.data) content = <p className="widget-message">Couldn't load upcoming events.</p>;
    else {
        const shown = events.data.filter(e => !e.routine);
        content = (
            <div className="upcoming-days">
                {days.map(date => <Day key={date} date={date} {...itemsOn(date, shown, birthdays.data ?? [])} />)}
            </div>
        );
    }

    return (
        <div className="widget upcoming-widget">
            <p className="widget-title">Upcoming</p>
            {content}
        </div>
    );
}

function itemsOn(date, events, birthdays) {
    const chips = [
        ...events.filter(e => e.all_day && e.start <= date && date <= e.end).map(e => ({ id: e.id, title: e.title })),
        ...birthdays.filter(b => b.date === date).map(b => ({ id: b.id, title: b.title, birthday: true })),
    ];
    // a timed event shows on the day it starts, so one still going from today is Today's
    const timed = events.filter(e => !e.all_day && today(new Date(e.start)) === date);
    return { chips, timed };
}

// One day's box. When its events don't all fit, the last ones fold into "+N".
// An empty day is dimmed, not collapsed, so the boxes show time as it passes.
function Day({ date, chips, timed }) {
    const bodyRef = useRef(null);
    const hidden = useHiddenCount(bodyRef, [...chips, ...timed].map(item => item.id).join(','), timed.length);
    const day = parseDate(date);
    const classes = chips.length + timed.length === 0 ? 'upcoming-day empty' : 'upcoming-day';

    return (
        <section className={classes} data-date={date}>
            <header className="upcoming-date">
                <span className="upcoming-weekday">{day.toLocaleDateString('en-US', {weekday: 'short'})}</span>
                <span>{day.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}</span>
            </header>
            <div className="upcoming-body" ref={bodyRef}>
                {chips.length > 0 && (
                    <ul className="upcoming-chips">
                        {chips.map(c => <li key={c.id} className={c.birthday ? 'chip birthday' : 'chip'}>{c.title}</li>)}
                    </ul>
                )}
                <ol className="upcoming-events">
                    {timed.slice(0, timed.length - hidden).map(e => (
                        <li key={e.id} className="upcoming-event">
                            <span className="upcoming-time">{formatTime(new Date(e.start))}</span>
                            <span className="upcoming-title">{e.title}</span>
                        </li>
                    ))}
                    {hidden > 0 && <li className="upcoming-more">+{hidden}</li>}
                </ol>
            </div>
        </section>
    );
}
