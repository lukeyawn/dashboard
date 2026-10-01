import { useEffect, useState } from 'react';
import { request } from '../lib/api';
import '../editors/editors.css';
import './Connect.css';

const NAMES = { chat: 'Dashboard', agent: 'Dashboard (suggest only)' };

// Approving a claude.ai sign-in (docs/CONNECTOR.md §4). claude.ai's sign-in
// redirects here, to the tailnet, so approving needs this device on the
// tailnet, the owner's login, and the browser that started the sign-in.
// Approving sends the browser back to claude.ai with a one-time code.
export default function Connect({ id }) {
    const [state, setState] = useState({ loading: true });
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        request(`/connect/${encodeURIComponent(id)}`).then(
            data => !cancelled && setState({ data }),
            error => !cancelled && setState({ error }),
        );
        return () => {
            cancelled = true;
        };
    }, [id]);

    async function decide(action) {
        setBusy(true);
        try {
            const { redirect } = await request(`/connect/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
            window.location.assign(redirect);
        } catch (error) {
            setState(prev => ({ ...prev, error }));
            setBusy(false);
        }
    }

    const { data, error, loading } = state;
    return (
        <main className="connect">
            <div className="connect-panel editor">
                <h1>Connect claude.ai</h1>
                {loading && <p className="editor-message">Loading…</p>}
                {error && <p className="editor-error" role="alert">{error.message}</p>}
                {data && (
                    <>
                        <p>claude.ai is asking to connect as <strong>{NAMES[data.connector]}</strong>.</p>
                        <p className="connect-access">It will be able to: {data.access}</p>
                        {data.same_browser ? (
                            <p className="editor-detail">Only approve if you just clicked Connect in claude.ai yourself.</p>
                        ) : (
                            <p className="editor-error">This sign-in was started in a different browser. Only approve a connection you started yourself, in this browser.</p>
                        )}
                        <div className="editor-buttons">
                            <button type="button" className="editor-primary" disabled={busy || !data.same_browser} onClick={() => decide('approve')}>Approve</button>
                            <button type="button" disabled={busy} onClick={() => decide('deny')}>Deny</button>
                        </div>
                    </>
                )}
                <a href="/manage#claude">Connections on /manage</a>
            </div>
        </main>
    );
}
