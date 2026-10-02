import { useCallback, useRef } from 'react';
import { daysBetween, parseDate, today } from '../../../shared/dates';
import { splitTasks } from '../../../shared/tasks';
import ClaudeMark from '../../components/ClaudeMark';
import EditButton from '../../components/EditButton';
import { TasksEditor } from '../../editors/editors';
import { useHiddenCount } from '../../hooks/useHiddenCount';
import { useNow } from '../../hooks/useNow';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useResource } from '../../hooks/useResource';
import { daysLabel, isUrgent } from './daysLabel';
import './AssignmentsWidget.css';

// Tasks with a due date in the assignments_area setting's area, nearest first
// (docs/BLOCKS.md §3). There's no cutoff: next month's paper is worth seeing
// early. Tapping one completes it after 5 seconds. Every other task is in Tasks.
export default function AssignmentsWidget() {
    const tasks = useResource('tasks', { params: { done: false } });
    const settings = useResource('settings');
    const todayDate = today(useNow());
    const { update } = tasks;
    const complete = useCallback(id => update(id, { done_at: new Date().toISOString() }), [update]);
    const pending = usePendingAction(complete);
    const area = settings.data?.assignments_area ?? null;
    const shown = tasks.data ? splitTasks(tasks.data.filter(t => !t.done_at), area).assignments : [];
    const listRef = useRef(null);
    const hidden = useHiddenCount(listRef, shown.map(t => t.id).join(','), shown.length);

    let content;
    if (tasks.loading || settings.loading) content = <p className="widget-message">Loading…</p>;
    else if (!tasks.data || !settings.data) content = <p className="widget-message">Couldn't load assignments.</p>;
    // the chosen area was deleted (or there's no School)
    else if (area === null) content = <p className="widget-message">Pick an area for Assignments in Settings.</p>;
    else if (shown.length === 0) content = <p className="widget-message">No assignments due.</p>;
    else {
        content = (
            <ul className="assignment-list" ref={listRef}>
                {shown.slice(0, shown.length - hidden).map(t => {
                    const days = daysBetween(todayDate, t.due);
                    const classes = ['assignment', isUrgent(days) && 'urgent', pending.isPending(t.id) && 'pending'].filter(Boolean).join(' ');
                    return (
                        <li key={t.id} className={classes} style={{'--pending-ms': `${pending.delayMs}ms`}}>
                            <button type="button" data-tap onClick={() => pending.toggle(t.id)} aria-pressed={pending.isPending(t.id)}>
                                <span className="assignment-info">
                                    <span className="assignment-name">{t.name}</span>
                                    <span className="assignment-date">
                                        {parseDate(t.due).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})}
                                    </span>
                                </span>
                                <span className="assignment-days">{daysLabel(days)}</span>
                            </button>
                            {t.claude_change && <ClaudeMark change={t.claude_change} name={t.name} onUndone={tasks.refresh} />}
                        </li>
                    );
                })}
                {hidden > 0 && <li className="assignment-more">+{hidden} more</li>}
            </ul>
        );
    }

    return (
        <div className="widget assignments-widget">
            <div className="widget-header">
                <p className="widget-title">Assignments</p>
                <EditButton title="Tasks" editor={TasksEditor} onClosed={tasks.refresh} />
            </div>
            {content}
            {tasks.saveError && <p className="widget-notice" role="status">Couldn't save. {tasks.saveError.message}</p>}
        </div>
    );
}
