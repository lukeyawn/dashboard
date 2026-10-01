import { useState } from 'react';
import Modal from './Modal';
import './EditButton.css';

// ✎: opens the widget's editor in the shared modal (DESIGN §6.3). Always
// visible, since a touchscreen has no hover (§6.1). onClosed lets the widget
// refetch at once rather than at its next poll.
export default function EditButton({ title, editor: Editor, onClosed }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" className="edit-button" data-tap aria-label={`Edit ${title.toLowerCase()}`} onClick={() => setOpen(true)}>
                ✎
            </button>
            {open && (
                <Modal title={title} onClose={() => { setOpen(false); onClosed?.(); }}>
                    <Editor />
                </Modal>
            )}
        </>
    );
}
