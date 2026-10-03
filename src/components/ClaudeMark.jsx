import { useState } from 'react';
import { request } from '../lib/api';
import { whoMade } from '../manage/describeChange';
import Modal from './Modal';
import '../editors/editors.css';
import './ClaudeMark.css';

// The ✦ on an item Claude created (docs/CONNECTOR.md §6). Tapping it says who
// added it and when, with Undo, so a wrong item can go from the wall without
// opening /manage. change is the row's claude_change: { id, at, actor, via }.
export default function ClaudeMark({ change, name, onUndone }) {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState(false);
    // mid-sentence: "Added by the agent"
    const who = change.actor === 'agent' ? 'the agent' : whoMade(change);
    const when = new Date(change.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    function show(event) {
        // the mark sits inside rows that are themselves tap targets
        event.preventDefault();
        event.stopPropagation();
        setMessage(null);
        setOpen(true);
    }

    async function undo() {
        setBusy(true);
        try {
            await request(`/changes/${change.id}/undo`, { method: 'POST' });
            setOpen(false);
            onUndone?.();
        } catch (err) {
            setMessage(`Couldn't undo. ${err.message}`);
        }
        setBusy(false);
    }

    return (
        <>
            <button type="button" className="claude-mark" aria-label={`Added by ${who}`} onClick={show}>✦</button>
            {open && (
                <Modal title="Added by Claude" onClose={() => setOpen(false)}>
                    <div className="editor claude-card">
                        <p className="editor-title">{name}</p>
                        <p className="editor-detail">Added by {who}, {when}</p>
                        {message && <p className="editor-error" role="status">{message}</p>}
                        <div className="editor-buttons">
                            <button type="button" className="editor-danger" disabled={busy} onClick={undo}>Undo</button>
                            <button type="button" onClick={() => setOpen(false)}>Keep it</button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
