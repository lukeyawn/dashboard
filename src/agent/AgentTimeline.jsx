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

// What the scheduled agent did, opened from the dock's ✦ (docs/AGENT.md §7):
// its runs over the last few days, newest first, each with its summary,
// briefing and changes, a line between what's new and what Luke has seen,
// Undo on each change, Undo this run, and Undo all new. A glance, not a
// gate: the changes are already on the dashboard.
//
// entries: from buildTimeline, as they were when the ✦ was tapped, so a poll
// can't move a row out from under a finger. Closing it is what counts as
// looking.
export default function AgentTimeline({ entries, onClose }) {
    const panel = useRef(null);
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
    const firstSeen = entries.findIndex(e => !e.isNew);

    return createPortal(
        <div className="agent-backdrop" onClick={event => event.target === event.currentTarget && onClose()}>
            <div className="agent-timeline" role="dialog" aria-modal="true" aria-label="✦ The agent" tabIndex={-1} ref={panel}>
                <div className="agent-timeline-header">
                    <h2>✦ The agent</h2>
                    <button type="button" className="agent-timeline-close" aria-label="Close" onClick={onClose}>✕</button>
                </div>
                <div className="agent-timeline-body editor">
                    {entries.length === 0 && <p className="editor-message">Nothing from the agent in the last few days.</p>}
                    {entries.map((entry, i) => (
                        <Fragment key={entry.key}>
                            {/* new above the line, seen below it */}
                            {i === firstSeen && i > 0 && <hr className="agent-seen-line" aria-label="Seen before" />}
                            <Entry
                                entry={entry}
                                undone={undone}
                                busy={busy}
                                armed={armed}
                                onUndo={undo}
                                onUndoRun={run => undoMany(`run-${run.id}`, { run: run.id })}
                            />
                        </Fragment>
                    ))}
                    {message && <p className="editor-message" role="status">{message}</p>}
                    <div className="editor-buttons">
                        {newChanges.length > 0 && (
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

// One run, or the changes in no run (from before runs existed)
function Entry({ entry, undone, busy, armed, onUndo, onUndoRun }) {
    const { run, changes } = entry;
    const state = run && runState(run);
    const left = changes.filter(c => !undone.has(c.id));
    return (
        <section className={entry.isNew ? 'agent-entry new' : 'agent-entry'}>
            <div className="agent-entry-head">
                <span className="editor-title">{run ? `${run.name ?? 'Run'} · ${when(run)}` : 'Not in a run'}</span>
                <span className="editor-detail">{run ? (run.summary ?? STATE_TEXT[state]) : `${day(entry.at)} ${time(entry.at)}`}</span>
            </div>
            {run?.briefing && <p className="agent-briefing">{run.briefing}</p>}
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
