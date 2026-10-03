import { useCallback, useRef, useState } from 'react';
import { STAGE_NAMES, boardApplications } from '../../../shared/applications';
import { today } from '../../../shared/dates';
import { STATUSES } from '../../../shared/schemas';
import ClaudeMark from '../../components/ClaudeMark';
import EditButton from '../../components/EditButton';
import Menu from '../../components/Menu';
import OpenLink from '../../components/OpenLink';
import { IDLE_MS } from '../../config';
import { ApplicationsEditor } from '../../editors/editors';
import { useHiddenCount } from '../../hooks/useHiddenCount';
import { useIdle } from '../../hooks/useIdle';
import { useIsKiosk } from '../../hooks/useKiosk';
import { useNow } from '../../hooks/useNow';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useResource } from '../../hooks/useResource';
import { appliedText, nextStep, rowDate } from './jobText';
import { PREPARE_STAGES, prepareUrl } from './prepare';
import './JobWidget.css';

// A list of what's next, and a panel for the selected application
// (docs/BLOCKS.md §6). OAs, interviews and offers come first, by the next
// step's date; the most recent applied ones fill the spare rows, muted.
// Rejected and withdrawn are archived, in the editor only. Tapping a row
// selects it; the top row is selected until then, and again on the kiosk
// after 5 idle minutes, so the wall shows the next interview or OA.
export default function JobWidget() {
    const apps = useResource('applications');
    const isKiosk = useIsKiosk();
    const todayDate = today(useNow());
    const [selected, setSelected] = useSelection(isKiosk);
    const { update } = apps;

    // the stage chosen from Stage ▾ for each application, waiting out the
    // pending tap. A new stage clears the next step, which was the old one's.
    const [chosen, setChosen] = useState({});
    const move = useCallback(id => update(id, { status: chosen[id], next_on: null, next_time: null }), [update, chosen]);
    const pending = usePendingAction(move);
    function choose(app, status) {
        if (status === app.status) return;
        setChosen(c => ({ ...c, [app.id]: status }));
        pending.toggle(app.id);
    }

    const board = boardApplications(apps.data ?? []);
    const current = board.find(a => a.id === selected) ?? board[0];
    const listRef = useRef(null);
    const hidden = useHiddenCount(listRef, board.map(a => `${a.id}:${a.status}:${a.next_on}`).join(','), board.length);

    let body;
    if (apps.loading) body = <p className="widget-message">Loading…</p>;
    else if (!apps.data) body = <p className="widget-message">Couldn't load applications. {apps.error?.message}</p>;
    else if (board.length === 0) body = <p className="widget-message">{apps.data.length ? 'Nothing open. Time to apply!' : 'No applications yet.'}</p>;
    else {
        const shown = board.slice(0, board.length - hidden);
        body = (
            <div className="job-body">
                <ul className="job-list" ref={listRef}>
                    {shown.map(a => (
                        <JobRow key={a.id} app={a} selected={a.id === current.id} pending={pending} todayDate={todayDate} onSelect={() => setSelected(a.id)} onUndone={apps.refresh} />
                    ))}
                    {hidden > 0 && <li className="job-more">+{hidden} more</li>}
                </ul>
                {/* keyed, so the notes start from the top for each application */}
                <JobPanel key={current.id} app={current} isKiosk={isKiosk} pending={pending} waitingFor={chosen[current.id]} onChoose={status => choose(current, status)} />
            </div>
        );
    }

    return (
        <div className="widget job-widget">
            <div className="widget-header">
                <p className="widget-title">Job search</p>
                <EditButton title="Job search" editor={ApplicationsEditor} onClosed={apps.refresh} />
            </div>
            {body}
            {apps.saveError && <p className="widget-notice" role="status">Couldn't save. {apps.saveError.message}</p>}
        </div>
    );
}

// The selected application's id, or null for the top row. On the kiosk it
// goes back to the top row after 5 minutes without a touch.
function useSelection(isKiosk) {
    const [selected, setSelected] = useState(null);
    const { idle } = useIdle(IDLE_MS);
    // set while rendering, when idle starts, rather than in an effect
    const [wasIdle, setWasIdle] = useState(idle);
    if (idle !== wasIdle) {
        setWasIdle(idle);
        if (idle && isKiosk) setSelected(null);
    }
    return [selected, setSelected];
}

// The company, the stage pill (only a label) and the next step's date. The
// whole row is one button that selects it.
function JobRow({ app: a, selected, pending, todayDate, onSelect, onUndone }) {
    const date = rowDate(a, todayDate);
    const className = ['job-row', a.status === 'applied' && 'spare', selected && 'selected', pending.isPending(a.id) && 'pending'].filter(Boolean).join(' ');
    return (
        <li className={className} style={{'--pending-ms': `${pending.delayMs}ms`}}>
            <button type="button" className="job-select" data-tap aria-pressed={selected} onClick={onSelect}>
                <span className="job-company">{a.company}</span>
                <span className={`status-pill ${a.status}`}>{STAGE_NAMES[a.status]}</span>
                <span className={date?.urgent ? 'job-date urgent' : 'job-date'}>{date?.text}</span>
            </button>
            {a.claude_change && <ClaudeMark change={a.claude_change} name={`${a.company} · ${a.role}`} onUndone={onUndone} />}
        </li>
    );
}

// The company and role, the next step, the date applied, Stage ▾, the notes,
// and ↗ Posting and Prepare, which the kiosk hides: it has no tabs and no
// back button, and isn't signed in to claude.ai.
function JobPanel({ app: a, isKiosk, pending, waitingFor, onChoose }) {
    const step = nextStep(a);
    const isPending = pending.isPending(a.id);
    return (
        <section className="job-panel" aria-label={`${a.company} · ${a.role}`}>
            <p className="job-panel-title">{a.company} · {a.role}</p>
            {step && <p className="job-panel-step">{step}</p>}
            <div className="job-panel-stage">
                <span className="job-panel-applied">{appliedText(a)}</span>
                {isPending ? (
                    <button type="button" className="job-moving" data-tap onClick={() => pending.toggle(a.id)}>
                        → {STAGE_NAMES[waitingFor]} · Cancel
                    </button>
                ) : (
                    <Menu label="Stage" sections={[{
                        items: STATUSES.map(s => ({ key: s, label: STAGE_NAMES[s], checked: a.status === s, onSelect: () => onChoose(s) })),
                    }]} />
                )}
            </div>
            <div className="job-notes">{a.notes ?? <span className="job-no-notes">No notes yet.</span>}</div>
            {!isKiosk && (a.url || PREPARE_STAGES.includes(a.status)) && (
                <div className="job-links">
                    {a.url && <OpenLink className="job-link" url={a.url} byClaude={a.url_by_claude}>↗ Posting</OpenLink>}
                    {PREPARE_STAGES.includes(a.status) && (
                        <a className="job-link" href={prepareUrl(a)} target="_blank" rel="noopener noreferrer" data-tap>Prepare</a>
                    )}
                </div>
            )}
        </section>
    );
}
