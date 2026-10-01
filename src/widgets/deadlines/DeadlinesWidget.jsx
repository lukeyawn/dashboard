import { useCallback } from 'react';
import { daysBetween, parseDate, today } from '../../../shared/dates';
import { useNow } from '../../hooks/useNow';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useResource } from '../../hooks/useResource';
import { daysLabel } from './daysLabel';
import './DeadlinesWidget.css';
import EditButton from '../../components/EditButton';
import { DeadlinesEditor } from '../../editors/editors';

// Open deadlines by due date (DESIGN §10). Tapping one completes it after 5 seconds.
export default function DeadlinesWidget() {
    const deadlines = useResource('deadlines', { params: { done: false } });
    const todayDate = today(useNow());
    const { update } = deadlines;
    const complete = useCallback(id => update(id, { done_at: new Date().toISOString() }), [update]);
    const pending = usePendingAction(complete);

    let content;
    if (deadlines.loading) content = <p className="widget-message">Loading…</p>;
    else if (!deadlines.data) content = <p className="widget-message">Couldn't load deadlines.</p>;
    else {
        const open = deadlines.data.filter(d => !d.done_at);
        content = open.length === 0 ? <p className="widget-message">No deadlines.</p> : (
            <ul className="deadlines-list">
                {open.map(d => {
                    const days = daysBetween(todayDate, d.due);
                    const classes = ['deadline', days <= 2 && 'urgent', pending.isPending(d.id) && 'pending'].filter(Boolean).join(' ');
                    return (
                        <li key={d.id} className={classes} style={{'--pending-ms': `${pending.delayMs}ms`}}>
                            <button type="button" data-tap onClick={() => pending.toggle(d.id)} aria-pressed={pending.isPending(d.id)}>
                                <span className="deadline-info">
                                    <span className="deadline-name">{d.name}</span>
                                    <span className="deadline-date">
                                        {parseDate(d.due).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})}
                                        {d.course && ` · ${d.course}`}
                                    </span>
                                </span>
                                <span className="deadline-days">{daysLabel(days)}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        );
    }

    return (
        <div className="widget deadlines-widget">
            <div className="widget-header">
                <p className="widget-title">Deadlines</p>
                <EditButton title="Deadlines" editor={DeadlinesEditor} onClosed={deadlines.refresh} />
            </div>
            {content}
            {deadlines.saveError && <p className="widget-notice" role="status">Couldn't save. {deadlines.saveError.message}</p>}
        </div>
    );
}
