import { useCallback, useEffect, useRef, useState } from 'react';
import { STAGE_NAMES, jobSections } from '../../../shared/applications';
import { today } from '../../../shared/dates';
import { STATUSES } from '../../../shared/schemas';
import ClaudeMark from '../../components/ClaudeMark';
import EditButton from '../../components/EditButton';
import Menu from '../../components/Menu';
import OpenLink from '../../components/OpenLink';
import { IDLE_MS, NOTES_SAVE_MS } from '../../config';
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

// Three lists, and a panel once an application is tapped (docs/BLOCKS.md §6).
// Needs action: every OA and offer, and anything with a next step from today
// on, by that step. To apply: saved to apply to, by the day to apply by.
// Waiting on: the rest, interviews first, applied ones muted. Rejected and
// withdrawn are archived, in the editor only. Until a row is tapped, the rows
// use the whole tile; the panel closes with ✕, a second tap on its row, or
// on the kiosk after 5 idle minutes.
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

    const { needsAction, toApply, waitingOn } = jobSections(apps.data ?? [], todayDate);
    const all = [...needsAction, ...toApply, ...waitingOn];
    // an application archived from its panel closes it
    const current = all.find(a => a.id === selected) ?? null;
    const listRef = useRef(null);
    const layoutKey = `${current ? 'panel' : 'full'}|${all.map(a => `${a.id}:${a.status}:${a.next_on}`).join(',')}`;
    // the last rows fold away first: Waiting on, then To apply, then Needs action
    const hidden = useHiddenCount(listRef, layoutKey, all.length);

    let body;
    if (apps.loading) body = <p className="widget-message">Loading…</p>;
    else if (!apps.data) body = <p className="widget-message">Couldn't load applications. {apps.error?.message}</p>;
    else if (all.length === 0) body = <p className="widget-message">{apps.data.length ? 'Nothing open. Time to apply!' : 'No applications yet.'}</p>;
    else {
        const shown = all.slice(0, all.length - hidden);
        const cut = [needsAction.length, needsAction.length + toApply.length];
        // a section whose rows have all folded away keeps no heading; "+N more" counts them
        const [shownToApply, shownWaiting] = [shown.slice(cut[0], cut[1]), shown.slice(cut[1])];
        const row = a => (
            <JobRow
                key={a.id} app={a} compact={Boolean(current)} isKiosk={isKiosk} selected={a.id === current?.id} pending={pending} todayDate={todayDate}
                onSelect={() => setSelected(a.id === current?.id ? null : a.id)} onUndone={apps.refresh}
            />
        );
        body = (
            <div className={current ? 'job-body open' : 'job-body'}>
                <ul className={current ? 'job-list compact' : 'job-list'} ref={listRef}>
                    <li className="job-section">Needs action</li>
                    {needsAction.length === 0 && <li className="job-none">Nothing right now.</li>}
                    {shown.slice(0, cut[0]).map(row)}
                    {shownToApply.length > 0 && <li className="job-section">To apply</li>}
                    {shownToApply.map(row)}
                    {shownWaiting.length > 0 && <li className="job-section">Waiting on</li>}
                    {shownWaiting.map(row)}
                    {hidden > 0 && <li className="job-more">+{hidden} more</li>}
                </ul>
                {current && (
                    // keyed, so each application gets its own notes draft, saved when the panel closes or moves on
                    <JobPanel
                        key={current.id} app={current} isKiosk={isKiosk} pending={pending} waitingFor={chosen[current.id]}
                        onChoose={status => choose(current, status)}
                        onSaveNotes={notes => update(current.id, { notes })}
                        onClose={() => setSelected(null)}
                    />
                )}
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

// The selected application's id, or null with the panel closed. On the
// kiosk the panel closes after 5 minutes without a touch.
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

// One line: "Company · Role" (cut off with "…" when short of room), ↗ to
// the posting and ✦ on what Claude added, then in aligned columns Prepare
// (for an OA or interview, while the panel is closed), the date, and the
// stage pill, which is only a label. The links aren't on the kiosk. The row's
// button lies under it all, so a tap anywhere but a link opens the panel, or
// closes it if it's open for this row.
function JobRow({ app: a, compact, isKiosk, selected, pending, todayDate, onSelect, onUndone }) {
    const date = rowDate(a, todayDate);
    const prepare = !compact && !isKiosk && PREPARE_STAGES.includes(a.status);
    const className = ['job-row', a.status === 'applied' && 'spare', selected && 'selected', pending.isPending(a.id) && 'pending'].filter(Boolean).join(' ');
    return (
        <li className={className} style={{'--pending-ms': `${pending.delayMs}ms`}}>
            <button type="button" className="job-select" data-tap aria-pressed={selected} aria-label={`${a.company} · ${a.role}, ${STAGE_NAMES[a.status]}`} onClick={onSelect} />
            <span className="job-left">
                <span className="job-name">
                    <span className="job-company">{a.company}</span>
                    <span className="job-role"> · {a.role}</span>
                </span>
                {a.url && !isKiosk && <OpenLink className="job-row-link" url={a.url} byClaude={a.url_by_claude} label={`${a.company} posting`}>↗</OpenLink>}
                {a.claude_change && <ClaudeMark change={a.claude_change} name={`${a.company} · ${a.role}`} onUndone={onUndone} />}
            </span>
            {prepare && <a className="job-link job-row-prepare" href={prepareUrl(a)} target="_blank" rel="noopener noreferrer" data-tap>Prepare</a>}
            <span className={date?.urgent ? 'job-date urgent' : 'job-date'}>{date?.text}</span>
            <span className={`status-pill ${a.status}`}>{STAGE_NAMES[a.status]}</span>
        </li>
    );
}

// The company and role with ✕, the next step, the date applied, Stage ▾,
// the notes to edit in place, and ↗ Posting and Prepare, which the kiosk
// hides: it has no tabs and no back button, and isn't signed in to claude.ai.
function JobPanel({ app: a, isKiosk, pending, waitingFor, onChoose, onSaveNotes, onClose }) {
    const step = nextStep(a);
    const isPending = pending.isPending(a.id);
    const notes = useNotesDraft(a.notes, onSaveNotes);
    const links = !isKiosk && (a.url || PREPARE_STAGES.includes(a.status));
    return (
        <section className="job-panel" aria-label={`${a.company} · ${a.role}`}>
            <div className="job-panel-header">
                <p className="job-panel-title">{a.company} · {a.role}</p>
                <button type="button" className="job-close" data-tap aria-label="Close" onClick={onClose}>✕</button>
            </div>
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
            <textarea
                className="job-notes"
                aria-label="Notes"
                placeholder="No notes yet."
                value={notes.draft}
                onChange={event => notes.change(event.target.value)}
                maxLength={5000}
            />
            <div className="job-panel-footer">
                {notes.dirty && notes.state !== 'saving'
                    ? <button type="button" className="job-save" data-tap onClick={notes.save}>Save</button>
                    : <span className="job-saved" role="status">{{ saving: 'Saving…', saved: 'Saved' }[notes.state] ?? ''}</span>}
                {notes.state === 'failed' && <span className="job-save-failed" role="status">Couldn't save</span>}
                {links && (
                    <div className="job-links">
                        {a.url && <OpenLink className="job-link" url={a.url} byClaude={a.url_by_claude}>↗ Posting</OpenLink>}
                        {PREPARE_STAGES.includes(a.status) && (
                            <a className="job-link" href={prepareUrl(a)} target="_blank" rel="noopener noreferrer" data-tap>Prepare</a>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}

// The notes as they're being edited. Saved with save(), NOTES_SAVE_MS after
// the last keystroke, or when the panel closes (unmounts). With no unsaved
// edits, the draft follows the stored notes, so a summary Claude adds shows
// up; with some, saving them replaces it, which the change record can undo.
// A failed save keeps the edit. state: 'saving', 'saved', 'failed' or null.
function useNotesDraft(stored, onSave) {
    const [draft, setDraft] = useState(stored ?? '');
    // the stored notes the draft was last the same as
    const [base, setBase] = useState(stored ?? '');
    const [seen, setSeen] = useState(stored);
    const [state, setState] = useState(null);
    if (stored !== seen) {
        setSeen(stored);
        if (draft === base) {
            setDraft(stored ?? '');
            setBase(stored ?? '');
        }
    }
    const dirty = draft !== base;

    const latest = useRef({ draft, base, onSave });
    useEffect(() => {
        latest.current = { draft, base, onSave };
    });
    // the text being sent, so closing mid-save doesn't send it twice
    const sending = useRef(null);

    const save = useCallback(async () => {
        const { draft: text, base: from, onSave: send } = latest.current;
        if (text === from || text === sending.current) return;
        sending.current = text;
        setState('saving');
        const saved = await send(text);
        sending.current = null;
        setState(saved ? 'saved' : 'failed');
        if (saved) setBase(text);
    }, []);

    // NOTES_SAVE_MS after the last keystroke
    useEffect(() => {
        if (!dirty) return;
        const timer = setTimeout(save, NOTES_SAVE_MS);
        return () => clearTimeout(timer);
    }, [draft, dirty, save]);

    // and when the panel closes, or moves to another application
    useEffect(() => save, [save]);

    return { draft, dirty, state, save, change: setDraft };
}
