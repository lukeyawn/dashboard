import { useCallback } from 'react';
import { NEXT_STATUS, STATUSES } from '../../../shared/schemas';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useResource } from '../../hooks/useResource';
import './JobWidget.css';

const RECENT = 3;

// A count for each stage and the most recently updated applications
// (DESIGN §10, Job search). Tapping a pill advances it after 5 seconds;
// rejected is only ever set in the editor, so a stray tap can't reject.
export default function JobWidget() {
    const apps = useResource('applications');
    const { action } = apps;
    const advance = useCallback(id => action(id, '/advance', {
        optimistic: a => ({ ...a, status: NEXT_STATUS[a.status], updated_at: new Date().toISOString() }),
    }), [action]);
    const pending = usePendingAction(advance);

    const rows = apps.data ?? [];
    const recent = [...rows]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
        .slice(0, RECENT);

    let list;
    if (apps.loading) list = <p className="widget-message">Loading…</p>;
    else if (!apps.data) list = <p className="widget-message">Couldn't load applications.</p>;
    else if (rows.length === 0) list = <p className="widget-message">No applications yet.</p>;
    else {
        list = (
            <ul className="job-list">
                {recent.map(a => {
                    const isPending = pending.isPending(a.id);
                    return (
                        <li key={a.id} className={isPending ? 'job-row pending' : 'job-row'} style={{'--pending-ms': `${pending.delayMs}ms`}}>
                            <span className="job-company">{a.company}</span>
                            <span className="job-role">{a.role}</span>
                            {NEXT_STATUS[a.status] ? (
                                <button
                                    type="button"
                                    className="status-button"
                                    data-tap
                                    aria-pressed={isPending}
                                    aria-label={`${a.company}: ${a.status}. Move to ${NEXT_STATUS[a.status]}`}
                                    onClick={() => pending.toggle(a.id)}
                                >
                                    <span className={`status-pill ${a.status}`}>{a.status}</span>
                                </button>
                            ) : (
                                <span className={`status-pill ${a.status}`}>{a.status}</span>
                            )}
                        </li>
                    );
                })}
            </ul>
        );
    }

    return (
        <div className="widget job-widget">
            <p className="widget-title">Job search</p>
            <div className="job-stages">
                {STATUSES.map(stage => (
                    <div key={stage} className={`job-stage ${stage}`}>
                        <div className="job-stage-count">{rows.filter(a => a.status === stage).length}</div>
                        <div className="job-stage-label">{stage}</div>
                    </div>
                ))}
            </div>
            {list}
            {apps.saveError && <p className="widget-notice" role="status">Couldn't save. {apps.saveError.message}</p>}
        </div>
    );
}
