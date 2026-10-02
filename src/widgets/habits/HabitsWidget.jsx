import { Fragment } from 'react';
import { addDays, parseDate, startOfWeek, today } from '../../../shared/dates';
import { useNow } from '../../hooks/useNow';
import { useResource } from '../../hooks/useResource';
import './HabitsWidget.css';
import EditButton from '../../components/EditButton';
import { HabitsEditor } from '../../editors/editors';
import { streakText, weekText } from './habitText';

const DAYS = 7;

// One row per habit, the last 7 days with today on the right, and the streak
// (DESIGN §10, Habits). Tapping a day toggles it at once; tap again to undo.
// A habit below 7 a week also shows its count this week, and a thin line
// marks where the week starts (docs/BLOCKS.md §2).
export default function HabitsWidget() {
    const todayDate = today(useNow());
    const days = Array.from({length: DAYS}, (_, i) => addDays(todayDate, i - (DAYS - 1)));
    const habits = useResource('habits', { params: { days: DAYS, archived: false } });
    const settings = useResource('settings');
    const weekStart = startOfWeek(todayDate, settings.data?.week_start);
    // the column the week starts in; none when it starts on the leftmost day
    const weekColumn = days.indexOf(weekStart) > 0 ? days.indexOf(weekStart) + 2 : null;

    function toggle(habit, date) {
        const done = habit.checks.includes(date);
        // this week's count moves at once too; the server's answer brings the streak
        const weekChange = date >= weekStart ? (done ? -1 : 1) : 0;
        habits.action(habit.id, `/checks/${date}?days=${DAYS}`, {
            method: done ? 'DELETE' : 'PUT',
            optimistic: h => ({
                ...h,
                checks: done ? h.checks.filter(d => d !== date) : [...h.checks, date].sort(),
                week_count: h.week_count + weekChange,
            }),
        });
    }

    let content;
    if (habits.loading) content = <p className="widget-message">Loading…</p>;
    else if (!habits.data) content = <p className="widget-message">Couldn't load habits.</p>;
    else if (habits.data.length === 0) content = <p className="widget-message">No habits yet.</p>;
    else {
        const shown = habits.data.filter(h => !h.archived_at);
        // every item is placed by row and column, so the divider can span the rows
        content = (
            <div className="habit-grid">
                {weekColumn && <div className="habit-week-divider" style={{ gridColumn: weekColumn, gridRow: `1 / ${shown.length + 2}` }} />}
                {days.map((date, col) => (
                    <div key={date} className={date === todayDate ? 'habit-day-label today' : 'habit-day-label'} style={{ gridColumn: col + 2, gridRow: 1 }}>
                        {parseDate(date).toLocaleDateString('en-US', {weekday: 'narrow'})}
                    </div>
                ))}
                {shown.map((h, i) => {
                    const week = weekText(h);
                    const met = h.week_count >= h.per_week;
                    return (
                        <Fragment key={h.id}>
                            <div className="habit-name" style={{ gridColumn: 1, gridRow: i + 2 }}>
                                <span>{h.name}</span>
                                {week && <span className={met ? 'habit-week met' : 'habit-week'}>{week}</span>}
                                <span className="habit-streak">{streakText(h) ?? 'no streak'}</span>
                            </div>
                            {days.map((date, col) => {
                                const done = h.checks.includes(date);
                                return (
                                    <button
                                        key={date}
                                        type="button"
                                        className="habit-cell"
                                        style={{ gridColumn: col + 2, gridRow: i + 2 }}
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
                    );
                })}
            </div>
        );
    }

    return (
        <div className="widget habits-widget">
            <div className="widget-header">
                <p className="widget-title">Habits</p>
                <EditButton title="Habits" editor={HabitsEditor} onClosed={habits.refresh} />
            </div>
            {content}
            {habits.saveError && <p className="widget-notice" role="status">Couldn't save. {habits.saveError.message}</p>}
        </div>
    );
}
