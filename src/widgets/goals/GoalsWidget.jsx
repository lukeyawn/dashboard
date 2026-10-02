import { useCallback } from 'react';
import { today } from '../../../shared/dates';
import { pace, shortDeadline, timeLeft } from '../../../shared/goals';
import { PENDING_MS } from '../../config';
import { useNow } from '../../hooks/useNow';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useResource } from '../../hooks/useResource';
import { useTimedFlags } from '../../hooks/useTimedFlags';
import { formatNumber } from '../../lib/format';
import './GoalsWidget.css';
import EditButton from '../../components/EditButton';
import { GoalsEditor } from '../../editors/editors';

const MAX_SHOWN = 4;

// Active goals, the nearest deadline first (DESIGN §10, docs/BLOCKS.md §5).
// A progress goal's + adds its step at once, with a 5-second "undo" that
// takes it back off. A milestone's Done waits 5 seconds, and a second tap
// cancels it. Dreams stay on /manage.
export default function GoalsWidget() {
    const goals = useResource('goals', { params: { archived: false, dream: false } });
    const todayDate = today(useNow());
    const undo = useTimedFlags(PENDING_MS);
    const add = (goal, by) => goals.action(goal.id, '/increment', {
        body: { by },
        optimistic: g => ({ ...g, current: Math.max(0, g.current + by), week_gain: g.week_gain + by }),
    });
    const { action } = goals;
    const achieve = useCallback(id => action(id, '/achieve', { optimistic: g => ({ ...g, archived_at: new Date().toISOString() }) }), [action]);
    const pending = usePendingAction(achieve);

    let content;
    if (goals.loading) content = <p className="widget-message">Loading…</p>;
    else if (!goals.data) content = <p className="widget-message">Couldn't load goals.</p>;
    else {
        const active = goals.data.filter(g => !g.archived_at && !g.dream);
        const more = active.length - MAX_SHOWN;
        content = active.length === 0 ? <p className="widget-message">No goals yet.</p> : (
            <>
                <ul className="goals-list">
                    {active.slice(0, MAX_SHOWN).map(g => (g.kind === 'milestone'
                        ? <Milestone key={g.id} goal={g} todayDate={todayDate} pending={pending} />
                        : <Progress key={g.id} goal={g} todayDate={todayDate} undo={undo} add={add} />))}
                </ul>
                {more > 0 && <p className="goals-more">+{more} more</p>}
            </>
        );
    }

    return (
        <div className="widget goals-widget">
            <div className="widget-header">
                <p className="widget-title">Goals</p>
                <EditButton title="Goals" editor={GoalsEditor} onClosed={goals.refresh} />
            </div>
            {content}
            {goals.saveError && <p className="widget-notice" role="status">Couldn't save. {goals.saveError.message}</p>}
        </div>
    );
}

// The name and count, the bar with a tick where steady progress would be
// today, and a line for the time left and what went up this week
function Progress({ goal: g, todayDate, undo, add }) {
    const done = g.current >= g.target;
    const onPace = pace(g, todayDate);
    const step = g.step ?? 1;
    const meta = [g.deadline && timeLeft(g.deadline, todayDate), g.week_gain > 0 && `+${formatNumber(g.week_gain)} this week`].filter(Boolean);
    const classes = ['goal', done && 'done', !done && onPace?.behind && 'behind'].filter(Boolean).join(' ');
    return (
        <li className={classes}>
            <div className="goal-body">
                <div className="goal-header">
                    <span className="goal-name">{g.name}</span>
                    <span className="goal-progress">
                        {done && <span className="goal-check" aria-label="finished">✓ </span>}
                        {formatNumber(g.current)}/{formatNumber(g.target)}{g.unit && ` ${g.unit}`}
                    </span>
                </div>
                <div className="progress-track">
                    <div className="progress-fill" style={{width: `${Math.min(100, (g.current / g.target) * 100)}%`}} />
                    {onPace && !done && <div className="progress-tick" aria-label="on pace" style={{left: `${onPace.share * 100}%`}} />}
                </div>
                {meta.length > 0 && <span className="goal-meta">{meta.join(' · ')}</span>}
            </div>
            {undo.isShown(g.id) && (
                <button type="button" className="goal-undo" data-tap onClick={() => { undo.hide(g.id); add(g, -step); }}>
                    undo
                </button>
            )}
            <button type="button" className="goal-plus" data-tap aria-label={`Add ${formatNumber(step)} to ${g.name}`} onClick={() => { add(g, step); undo.show(g.id); }}>
                +{formatNumber(step)}
            </button>
        </li>
    );
}

// The name, "by Dec 31 · 3 wk left" with a deadline, and Done
function Milestone({ goal: g, todayDate, pending }) {
    const isPending = pending.isPending(g.id);
    return (
        <li className={isPending ? 'goal milestone pending' : 'goal milestone'} style={{'--pending-ms': `${pending.delayMs}ms`}}>
            <div className="goal-body">
                <span className="goal-name">{g.name}</span>
                {g.deadline && <span className="goal-meta">by {shortDeadline(g.deadline, todayDate)} · {timeLeft(g.deadline, todayDate)}</span>}
            </div>
            <button type="button" className="goal-plus goal-done" data-tap aria-pressed={isPending} aria-label={`${g.name} is done`} onClick={() => pending.toggle(g.id)}>
                Done
            </button>
        </li>
    );
}
