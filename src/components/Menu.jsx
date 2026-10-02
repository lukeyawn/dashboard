import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './Menu.css';

// A button that opens a short list of choices, sized for touch: Tasks' Sort
// and Filter, and later Job search's Stage (docs/BLOCKS.md §3, §6). Rendered
// into <body>, like the modal, so the tile's clipping can't cut it off. It
// opens under the button, right-aligned, and closes on a choice, Escape or a
// tap outside, which a backdrop catches so it can't also tick a task below.
//
// sections: [{ title?, items: [{ key, label, checked, toggle?, onSelect }] }].
// An item with toggle is a switch (a checkbox); the rest pick one of a set.
export default function Menu({ label, sections }) {
    const [open, setOpen] = useState(false);
    const [place, setPlace] = useState(null);
    const button = useRef(null);

    useLayoutEffect(() => {
        if (!open) return;
        const rect = button.current.getBoundingClientRect();
        // --top lets the CSS keep a long menu on screen; it scrolls instead
        setPlace({ top: rect.bottom, right: window.innerWidth - rect.right, '--top': `${rect.bottom}px` });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = event => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    function choose(item) {
        setOpen(false);
        item.onSelect();
    }

    return (
        <>
            <button type="button" className="menu-button" data-tap aria-haspopup="menu" aria-expanded={open} ref={button} onClick={() => setOpen(!open)}>
                {label} ▾
            </button>
            {open && createPortal(
                <div className="menu-backdrop" onClick={() => setOpen(false)}>
                    <div className="menu" role="menu" aria-label={label} style={place ?? undefined} onClick={event => event.stopPropagation()}>
                        {sections.map((section, i) => (
                            <div key={section.title ?? i} className="menu-section" role="group" aria-label={section.title}>
                                {section.title && <p className="menu-title">{section.title}</p>}
                                {section.items.map(item => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        className="menu-item"
                                        role={item.toggle ? 'menuitemcheckbox' : 'menuitemradio'}
                                        aria-checked={Boolean(item.checked)}
                                        onClick={() => choose(item)}
                                    >
                                        <span className="menu-check" aria-hidden="true">{item.checked ? '✓' : ''}</span>
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
