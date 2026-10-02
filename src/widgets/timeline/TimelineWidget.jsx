import { useRef } from 'react';
import { today } from '../../../shared/dates';
import { useHiddenCount } from '../../hooks/useHiddenCount';
import { useNow } from '../../hooks/useNow';
import { useResource } from '../../hooks/useResource';
import { formatTime } from '../../lib/format';
import './TimelineWidget.css';

// Today's events from Google Calendar, read-only (DESIGN §10, Timeline).
// All-day events and today's birthdays are chips at the top; past events are
// dimmed and the current one highlighted. When they don't all fit, the
// earliest past events fold into "N earlier".
export default function TimelineWidget() {
    const now = useNow();
    const todayDate = today(now);
    const range = { from: todayDate, to: todayDate };
    const events = useResource('events', { params: range });
    const birthdays = useResource('birthdays', { params: range });

    const timed = (events.data ?? []).filter(e => !e.all_day).map(e => {
        const start = new Date(e.start);
        const end = new Date(e.end);
        const status = end <= now ? 'past' : start <= now ? 'current' : 'upcoming';
        return { ...e, startDate: start, status };
    });
    const pastCount = timed.filter(e => e.status === 'past').length;
    const listRef = useRef(null);
    const folded = useHiddenCount(listRef, `${todayDate}|${timed.map(e => `${e.id}:${e.status}`).join(',')}`, pastCount);

    if (events.loading) return <Frame><p className="widget-message">Loading…</p></Frame>;
    if (!events.data) return <Frame><p className="widget-message">Couldn't load today's events.</p></Frame>;

    const chips = [
        ...events.data.filter(e => e.all_day).map(e => ({ id: e.id, title: e.title })),
        ...(birthdays.data ?? []).map(b => ({ id: b.id, title: b.title, birthday: true })),
    ];
    if (chips.length === 0 && timed.length === 0) {
        return <Frame><p className="widget-message">Nothing scheduled today.</p></Frame>;
    }

    return (
        <Frame>
            {chips.length > 0 && (
                <ul className="timeline-chips">
                    {chips.map(c => <li key={c.id} className={c.birthday ? 'chip birthday' : 'chip'}>{c.title}</li>)}
                </ul>
            )}
            <ol className="timeline" ref={listRef}>
                {folded > 0 && <li className="timeline-earlier">{folded} earlier</li>}
                {timed.slice(folded).map(e => (
                    <li key={e.id} className={`timeline-event ${e.status}`}>
                        <span className="timeline-time">{formatTime(e.startDate)}</span>
                        <span className="timeline-title">{e.title}</span>
                        {e.location && <span className="timeline-location">{e.location}</span>}
                    </li>
                ))}
            </ol>
        </Frame>
    );
}

function Frame({ children }) {
    return (
        <div className="widget timeline-widget">
            <p className="widget-title">Today</p>
            {children}
        </div>
    );
}
