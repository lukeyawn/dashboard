import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

// The shared editor modal (DESIGN §6.3). It sits in the top half of the screen,
// so the on-screen keyboard, which opens from the bottom, doesn't cover it.
// Rendered into <body>: a widget's frosted glass would otherwise trap it.
export default function Modal({ title, onClose, children }) {
    const panel = useRef(null);

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

    return createPortal(
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && onClose()}>
            <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">{children}</div>
            </div>
        </div>,
        document.body,
    );
}
