import { useCallback } from 'react';
import { daysBetween, parseDate, today } from '../../../shared/dates';
import { compareDue, isDueSoon } from '../../../shared/tasks';
import EditButton from '../../components/EditButton';
import { TasksEditor } from '../../editors/editors';
import { useNow } from '../../hooks/useNow';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useResource } from '../../hooks/useResource';
import { daysLabel } from './daysLabel';
import './DueSoonWidget.css';

// Open tasks that are overdue or due within 14 days, soonest first (DESIGN §10).
// Tapping one completes it after 5 seconds. The rest of the tasks are in the Tasks tile.
export default function DueSoonWidget() {
    const tasks = useResource('tasks', { params: { done: false } });
    const todayDate = today(useNow());
    const { update } = tasks;
    const complete = useCallback(id => update(id, { done_at: new Date().toISOString() }), [update]);
    const pending = usePendingAction(complete);

    let content;
    if (tasks.loading) content = <p className="widget-message">Loading…</p>;
    else if (!tasks.data) content = <p className="widget-message">Couldn't load tasks.</p>;
    else {
        const due = tasks.data.filter(t => !t.done_at && isDueSoon(t, todayDate)).sort(compareDue);
        content = due.length === 0 ? <p className="widget-message">Nothing due in the next two weeks.</p> : (
            <ul className="due-list">
                {due.map(t => {
                    const days = daysBetween(todayDate, t.due);
                    const classes = ['due', days <= 2 && 'urgent', pending.isPending(t.id) && 'pending'].filter(Boolean).join(' ');
                    return (
                        <li key={t.id} className={classes} style={{'--pending-ms': `${pending.delayMs}ms`}}>
                            <button type="button" data-tap onClick={() => pending.toggle(t.id)} aria-pressed={pending.isPending(t.id)}>
                                <span className="due-info">
                                    <span className="due-name">{t.name}</span>
                                    <span className="due-date">
                                        {parseDate(t.due).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})}
                                        {t.area && ` · ${t.area}`}
                                    </span>
                                </span>
                                <span className="due-days">{daysLabel(days)}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        );
    }

    return (
        <div className="widget due-widget">
            <div className="widget-header">
                <p className="widget-title">Due soon</p>
                <EditButton title="Tasks" editor={TasksEditor} onClosed={tasks.refresh} />
            </div>
            {content}
            {tasks.saveError && <p className="widget-notice" role="status">Couldn't save. {tasks.saveError.message}</p>}
        </div>
    );
}
