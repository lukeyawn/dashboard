import { PENDING_MS } from '../../config';
import { useResource } from '../../hooks/useResource';
import { useTimedFlags } from '../../hooks/useTimedFlags';
import { formatNumber } from '../../lib/format';
import './GoalsWidget.css';

const MAX_SHOWN = 4;

// Active goals with progress (DESIGN §10, Goals). +1 is sent at once, with a
// 5-second "undo" that sends −1.
export default function GoalsWidget() {
    const goals = useResource('goals', { params: { archived: false } });
    const undo = useTimedFlags(PENDING_MS);
    const add = (goal, by) => goals.action(goal.id, '/increment', {
        body: { by },
        optimistic: g => ({ ...g, current: Math.max(0, g.current + by) }),
    });

    let content;
    if (goals.loading) content = <p className="widget-message">Loading…</p>;
    else if (!goals.data) content = <p className="widget-message">Couldn't load goals.</p>;
    else {
        const active = goals.data.filter(g => !g.archived_at);
        const more = active.length - MAX_SHOWN;
        content = active.length === 0 ? <p className="widget-message">No goals yet.</p> : (
            <>
                <ul className="goals-list">
                    {active.slice(0, MAX_SHOWN).map(g => {
                        const done = g.current >= g.target;
                        return (
                            <li key={g.id} className={done ? 'goal done' : 'goal'}>
                                <div className="goal-header">
                                    <span className="goal-name">{g.name}</span>
                                    <span className="goal-progress">
                                        {done && <span className="goal-check" aria-label="finished">✓ </span>}
                                        {formatNumber(g.current)}/{formatNumber(g.target)}{g.unit && ` ${g.unit}`}
                                    </span>
                                </div>
                                <div className="progress-track">
                                    <div className="progress-fill" style={{width: `${Math.min(100, (g.current / g.target) * 100)}%`}} />
                                </div>
                                {undo.isShown(g.id) && (
                                    <button type="button" className="goal-undo" data-tap onClick={() => { undo.hide(g.id); add(g, -1); }}>
                                        undo
                                    </button>
                                )}
                                <button type="button" className="goal-plus" data-tap aria-label={`Add 1 to ${g.name}`} onClick={() => { add(g, 1); undo.show(g.id); }}>
                                    +1
                                </button>
                            </li>
                        );
                    })}
                </ul>
                {more > 0 && <p className="goals-more">+{more} more</p>}
            </>
        );
    }

    return (
        <div className="widget goals-widget">
            <p className="widget-title">Goals</p>
            {content}
            {goals.saveError && <p className="widget-notice" role="status">Couldn't save. {goals.saveError.message}</p>}
        </div>
    );
}
