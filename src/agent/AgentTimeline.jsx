import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { runState } from '../../shared/runs';
import { request } from '../lib/api';
import { describeChange, describeSkipped } from '../manage/describeChange';
import '../editors/editors.css';
import './AgentTimeline.css';

const time = at => new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const day = at => new Date(at).toLocaleDateString('en-US', { weekday: 'short' });

// "Sat 7:02 – 7:09 AM", or "Sat 7:02 AM" for a run that never reported
function when(run) {
    if (!run.ended_at) return `${day(run.started_at)} ${time(run.started_at)}`;
    return `${day(run.started_at)} ${time(run.started_at)} – ${time(run.ended_at)}`;
}

const STATE_TEXT = { running: 'Still running', unreported: "Didn't report" };

// What the scheduled agent did, opened from the dock's ✦ (docs/AGENT.md §7),
// over the last few days, newest first, in two tabs:
// - Briefings, first: what each run told Luke, and a link to its changes;
// - Changes: each run headed by its summary, its changes with Undo, Undo
//   this run, and Undo all new. A glance, not a gate: the changes are
//   already on the dashboard.
// Both have a line between what's new and what Luke has seen.
//
// entries: from buildTimeline, as they were when the ✦ was tapped, so a poll
// can't move a row out from under a finger. Closing it is what counts as
// looking, at both tabs.
export default function AgentTimeline({ entries, onClose }) {
    const panel = useRef(null);
    const [tab, setTab] = useState('briefings');
    // the run a briefing's "n changes" opened the Changes tab at
    const [focusRun, setFocusRun] = useState(null);
    // ids undone here; the record keeps the agent's changes either way
    const [undone, setUndone] = useState(() => new Set());
    // the button waiting for its second tap
    const [armed, setArmed] = useState(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        const onKey = event => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    useEffect(() => {
        panel.current?.focus();
    }, []);

    useEffect(() => {
        if (tab !== 'changes' || focusRun === null) return;
        panel.current?.querySelector(`[data-run="${focusRun}"]`)?.scrollIntoView?.({ block: 'start' });
    }, [tab, focusRun]);

    function showChanges(run) {
        setFocusRun(run?.id ?? null);
        setTab('changes');
    }

    const markUndone = ids => setUndone(prev => new Set([...prev, ...ids]));

    async function undo(change) {
        setArmed(null);
        setBusy(true);
        try {
            await request(`/changes/${change.id}/undo`, { method: 'POST' });
            markUndone([change.id]);
            setMessage(null);
        } catch (err) {
            setMessage(`Couldn't undo "${describeChange(change)}". ${err.message}`);
        }
        setBusy(false);
    }

    // one run's changes, or every new one, through undo-since; what can't be
    // undone is skipped and named, with why
    async function undoMany(key, body) {
        if (armed !== key) return setArmed(key);
        setArmed(null);
        setBusy(true);
        try {
            const { undone: done, skipped } = await request('/changes/undo-since', { method: 'POST', body: { ...body, actors: ['agent'] } });
            markUndone(done.map(c => c.id));
            const parts = [`Undid ${done.length} ${done.length === 1 ? 'change' : 'changes'}.`];
            if (skipped.length) parts.push(describeSkipped(skipped));
            setMessage(parts.join(' '));
        } catch (err) {
            setMessage(`Couldn't undo. ${err.message}`);
        }
        setBusy(false);
    }

    const newChanges = entries.filter(e => e.isNew).flatMap(e => e.changes).filter(c => !undone.has(c.id));
    // runs that changed nothing have no place in Changes, and changes in no
    // run (from before runs existed) none in Briefings
    const briefings = entries.filter(e => e.run);
    const withChanges = entries.filter(e => e.changes.length > 0);

    return createPortal(
        <div className="agent-backdrop" onClick={event => event.target === event.currentTarget && onClose()}>
            <div className="agent-timeline" role="dialog" aria-modal="true" aria-label="✦ The agent" tabIndex={-1} ref={panel}>
                <div className="agent-timeline-header">
                    <h2>✦ The agent</h2>
                    <button type="button" className="agent-timeline-close" aria-label="Close" onClick={onClose}>✕</button>
                </div>
                <div className="agent-tabs" role="tablist" aria-label="What the agent did">
                    <button type="button" role="tab" id="agent-tab-briefings" aria-controls="agent-panel" aria-selected={tab === 'briefings'} onClick={() => setTab('briefings')}>
                        Briefings
                    </button>
                    <button type="button" role="tab" id="agent-tab-changes" aria-controls="agent-panel" aria-selected={tab === 'changes'} onClick={() => showChanges(null)}>
                        Changes{newChanges.length > 0 && <>{' '}<span className="agent-tab-new">· {newChanges.length} new</span></>}
                    </button>
                </div>
                <div className="agent-timeline-body editor" id="agent-panel" role="tabpanel" aria-labelledby={`agent-tab-${tab}`}>
                    {tab === 'briefings' && (
                        <>
                            {briefings.length === 0 && <p className="editor-message">No briefings in the last few days.</p>}
                            <Lined entries={briefings} render={entry => <Briefing entry={entry} undone={undone} onShowChanges={showChanges} />} />
                        </>
                    )}
                    {tab === 'changes' && (
                        <>
                            {withChanges.length === 0 && <p className="editor-message">No changes in the last few days.</p>}
                            <Lined
                                entries={withChanges}
                                render={entry => (
                                    <Changes
                                        entry={entry}
                                        undone={undone}
                                        busy={busy}
                                        armed={armed}
                                        onUndo={undo}
                                        onUndoRun={run => undoMany(`run-${run.id}`, { run: run.id })}
                                    />
                                )}
                            />
                            {message && <p className="editor-message" role="status">{message}</p>}
                        </>
                    )}
                    <div className="editor-buttons">
                        {tab === 'changes' && newChanges.length > 0 && (
                            <button
                                type="button"
                                className={armed === 'all' ? 'editor-danger armed' : 'editor-danger'}
                                disabled={busy}
                                onClick={() => undoMany('all', { since: newChanges.map(c => c.at).sort()[0] })}
                            >
                                {armed === 'all' ? 'Tap again to undo all new' : 'Undo all new'}
                            </button>
                        )}
                        <button type="button" className="editor-primary" onClick={onClose}>Done</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

// The entries, with a line where the new ones (above) end and the seen ones
// (below) begin
function Lined({ entries, render }) {
    const firstSeen = entries.findIndex(e => !e.isNew);
    return entries.map((entry, i) => (
        <Fragment key={entry.key}>
            {i === firstSeen && i > 0 && <hr className="agent-seen-line" aria-label="Seen before" />}
            {render(entry)}
        </Fragment>
    ));
}

const runTitle = run => `${run.label ?? run.name ?? 'Run'} · ${when(run)}`;

// What one run told Luke: its briefing, or why there isn't one, and a link to
// what it changed, so the changes are never out of reach
function Briefing({ entry, undone, onShowChanges }) {
    const { run, changes } = entry;
    const left = changes.filter(c => !undone.has(c.id)).length;
    return (
        <section className={entry.isNew ? 'agent-entry new' : 'agent-entry'}>
            <div className="agent-entry-head">
                <span className="editor-title">{runTitle(run)}</span>
                {!run.briefing && <span className="editor-detail">{STATE_TEXT[runState(run)]}</span>}
            </div>
            {run.briefing && <p className="agent-briefing">{run.briefing}</p>}
            {changes.length > 0
                ? (
                    <button type="button" className="agent-changes-link" onClick={() => onShowChanges(run)}>
                        {changes.length} {changes.length === 1 ? 'change' : 'changes'}{left < changes.length ? ` (${changes.length - left} undone)` : ''} ›
                    </button>
                )
                : <span className="editor-detail">No changes</span>}
        </section>
    );
}

// What one run did, headed by its summary, or the changes in no run (from
// before runs existed)
function Changes({ entry, undone, busy, armed, onUndo, onUndoRun }) {
    const { run, changes } = entry;
    const left = changes.filter(c => !undone.has(c.id));
    return (
        <section className={entry.isNew ? 'agent-entry new' : 'agent-entry'} data-run={run?.id}>
            <div className="agent-entry-head">
                <span className="editor-title">{run ? runTitle(run) : 'Not in a run'}</span>
                <span className="editor-detail">{run ? (run.summary ?? STATE_TEXT[runState(run)]) : `${day(entry.at)} ${time(entry.at)}`}</span>
            </div>
            {changes.length > 0 && (
                <ul className="editor-list">
                    {changes.map(change => (
                        <li key={change.id} className="editor-item">
                            <div className="editor-row">
                                <div className="editor-text">
                                    <span className={undone.has(change.id) ? 'editor-title editor-optional' : 'editor-title'}>{describeChange(change)}</span>
                                    <span className="editor-detail">{time(change.at)}</span>
                                </div>
                                <div className="editor-buttons">
                                    {undone.has(change.id)
                                        ? <span className="editor-detail">Undone</span>
                                        : <button type="button" disabled={busy} onClick={() => onUndo(change)}>Undo</button>}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {run && left.length > 0 && (
                <div className="editor-buttons">
                    <button
                        type="button"
                        className={armed === `run-${run.id}` ? 'editor-danger armed' : 'editor-danger'}
                        disabled={busy}
                        onClick={() => onUndoRun(run)}
                    >
                        {armed === `run-${run.id}` ? 'Tap again to undo this run' : 'Undo this run'}
                    </button>
                </div>
            )}
        </section>
    );
}
