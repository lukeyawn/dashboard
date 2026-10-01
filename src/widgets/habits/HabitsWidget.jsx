import { Fragment } from 'react';
import { addDays, parseDate, today } from '../../../shared/dates';
import { useNow } from '../../hooks/useNow';
import { useResource } from '../../hooks/useResource';
import './HabitsWidget.css';

const DAYS = 7;

// One row per habit, the last 7 days with today on the right, and the streak
// (DESIGN §10, Habits). Tapping a day toggles it at once; tap again to undo.
export default function HabitsWidget() {
    const todayDate = today(useNow());
    const days = Array.from({length: DAYS}, (_, i) => addDays(todayDate, i - (DAYS - 1)));
    const habits = useResource('habits', { params: { days: DAYS, archived: false } });

    function toggle(habit, date) {
        const done = habit.checks.includes(date);
        habits.action(habit.id, `/checks/${date}?days=${DAYS}`, {
            method: done ? 'DELETE' : 'PUT',
            optimistic: h => ({ ...h, checks: done ? h.checks.filter(d => d !== date) : [...h.checks, date].sort() }),
        });
    }

    let content;
    if (habits.loading) content = <p className="widget-message">Loading…</p>;
    else if (!habits.data) content = <p className="widget-message">Couldn't load habits.</p>;
    else if (habits.data.length === 0) content = <p className="widget-message">No habits yet.</p>;
    else {
        content = (
            <div className="habit-grid">
                <div />
                {days.map(date => (
                    <div key={date} className={date === todayDate ? 'habit-day-label today' : 'habit-day-label'}>
                        {parseDate(date).toLocaleDateString('en-US', {weekday: 'narrow'})}
                    </div>
                ))}
                {habits.data.filter(h => !h.archived_at).map(h => (
                    <Fragment key={h.id}>
                        <div className="habit-name">
                            <span>{h.name}</span>
                            <span className="habit-streak">{h.streak > 0 ? `${h.streak}-day streak` : 'no streak'}</span>
                        </div>
                        {days.map(date => {
                            const done = h.checks.includes(date);
                            return (
                                <button
                                    key={date}
                                    type="button"
                                    className="habit-cell"
                                    data-tap="narrow"
                                    aria-pressed={done}
                                    aria-label={`${h.name}, ${parseDate(date).toLocaleDateString('en-US', {weekday: 'long'})}`}
                                    onClick={() => toggle(h, date)}
                                >
                                    <span className={done ? 'habit-dot done' : 'habit-dot'} />
                                </button>
                            );
                        })}
                    </Fragment>
                ))}
            </div>
        );
    }

    return (
        <div className="widget habits-widget">
            <p className="widget-title">Habits</p>
            {content}
            {habits.saveError && <p className="widget-notice" role="status">Couldn't save. {habits.saveError.message}</p>}
        </div>
    );
}
