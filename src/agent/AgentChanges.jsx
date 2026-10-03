import { useState } from 'react';
import Modal from '../components/Modal';
import { request } from '../lib/api';
import { describeChange } from '../manage/describeChange';
import '../editors/editors.css';

const when = at => new Date(at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

// What the scheduled agent changed since Luke last looked, opened from the
// dock's chip (docs/AGENT.md §3): each change in words with Undo, and Undo
// all of these. A glance, not a gate: the changes are already on the
// dashboard. changes: newest first. Closing it is what counts as looking.
export default function AgentChanges({ changes, onClose }) {
    // ids undone here; the record keeps the agent's changes either way
    const [undone, setUndone] = useState(() => new Set());
    const [armed, setArmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);

    const markUndone = ids => setUndone(prev => new Set([...prev, ...ids]));

    async function undo(change) {
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

    // the existing undo-since, for the agent only, from the oldest change
    // listed; a change Luke has edited since is skipped and named
    async function undoAll() {
        if (!armed) return setArmed(true);
        setArmed(false);
        setBusy(true);
        try {
            const { undone: done, skipped } = await request('/changes/undo-since', {
                method: 'POST',
                body: { since: changes.map(c => c.at).sort()[0], actors: ['agent'] },
            });
            markUndone(done.map(c => c.id));
            const parts = [`Undid ${done.length} ${done.length === 1 ? 'change' : 'changes'}.`];
            if (skipped.length) parts.push(`Kept ${skipped.length} you've changed since: ${skipped.map(s => describeChange(s.change)).join('; ')}.`);
            setMessage(parts.join(' '));
        } catch (err) {
            setMessage(`Couldn't undo. ${err.message}`);
        }
        setBusy(false);
    }

    const left = changes.filter(c => !undone.has(c.id));

    return (
        <Modal title="✦ New from the agent" onClose={onClose}>
            <div className="editor agent-changes">
                <ul className="editor-list">
                    {changes.map(change => (
                        <li key={change.id} className="editor-item">
                            <div className="editor-row">
                                <div className="editor-text">
                                    <span className={undone.has(change.id) ? 'editor-title editor-optional' : 'editor-title'}>{describeChange(change)}</span>
                                    <span className="editor-detail">{when(change.at)}</span>
                                </div>
                                <div className="editor-buttons">
                                    {undone.has(change.id)
                                        ? <span className="editor-detail">Undone</span>
                                        : <button type="button" disabled={busy} onClick={() => undo(change)}>Undo</button>}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
                {message && <p className="editor-message" role="status">{message}</p>}
                <div className="editor-buttons">
                    {left.length > 0 && (
                        <button type="button" className={armed ? 'editor-danger armed' : 'editor-danger'} disabled={busy} onClick={undoAll}>
                            {armed ? 'Tap again to undo them all' : 'Undo all of these'}
                        </button>
                    )}
                    <button type="button" className="editor-primary" onClick={onClose}>Done</button>
                </div>
            </div>
        </Modal>
    );
}
