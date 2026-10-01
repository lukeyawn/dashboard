import { useState } from 'react';
import { useResource } from '../hooks/useResource';
import { request } from '../lib/api';
import { ACTOR_LABELS, describeChange } from './describeChange';
import '../editors/editors.css';

// Recent changes from anyone, each with Undo (DESIGN §5.5). An undo is itself
// a change, so it shows up here and can be undone in turn.
export default function History() {
    const [actor, setActor] = useState('');
    const changes = useResource('changes', { params: { limit: 50, actor: actor || undefined } });
    const [message, setMessage] = useState(null);

    async function undo(change) {
        try {
            await request(`/changes/${change.id}/undo`, { method: 'POST' });
            setMessage(`Undid: ${describeChange(change)}`);
        } catch (err) {
            setMessage(`Couldn't undo. ${err.message}`);
        }
        changes.refresh();
    }

    return (
        <div className="editor history">
            <div className="editor-toolbar">
                <label>
                    <span className="editor-label">Made by</span>
                    <select value={actor} onChange={event => setActor(event.target.value)}>
                        <option value="">Anyone</option>
                        {Object.entries(ACTOR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>
            </div>
            {message && <p className="editor-message" role="status">{message}</p>}
            {changes.loading && <p className="editor-message">Loading…</p>}
            {!changes.loading && !changes.data && <p className="editor-message">Couldn't load the history.</p>}
            {changes.data?.length === 0 && <p className="editor-message">No changes yet.</p>}
            <ul className="editor-list">
                {(changes.data ?? []).map(change => (
                    <li key={change.id} className="editor-item">
                        <div className="editor-row">
                            <div className="editor-text">
                                <span className="editor-title">{describeChange(change)}</span>
                                <span className="editor-detail">
                                    {ACTOR_LABELS[change.actor] ?? change.actor} · {new Date(change.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                </span>
                            </div>
                            <div className="editor-buttons">
                                <button type="button" onClick={() => undo(change)}>Undo</button>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
