import { useState } from 'react';
import { useResource } from '../hooks/useResource';
import { request } from '../lib/api';
import ClaudeChanges from './ClaudeChanges';
import '../editors/editors.css';

const NAMES = { chat: 'claude.ai chats', agent: 'The agent (suggest only)' };
const when = at => new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// The "Claude" section on /manage (docs/CONNECTOR.md §9): each connector's
// switch, its connections with Revoke, today's count, and Claude's changes.
// Switching a connector off revokes its connections at once; switching it
// back on only allows new sign-ins from claude.ai.
export default function Claude() {
    const connectors = useResource('connectors');
    const connections = useResource('connections');
    // the button waiting for its second tap, so one stray tap can't switch off or revoke
    const [armed, setArmed] = useState(null);
    const [message, setMessage] = useState(null);

    async function perform(run, done) {
        setArmed(null);
        try {
            await run();
            setMessage(done);
        } catch (err) {
            setMessage(`Couldn't do that. ${err.message}`);
        }
        connectors.refresh();
        connections.refresh();
    }

    // the first tap arms the button; the second does it
    const confirmThen = (key, run, done) => (armed === key ? perform(run, done) : setArmed(key));

    function toggle(connector) {
        const run = () => request(`/connectors/${connector.name}`, { method: 'PUT', body: { enabled: !connector.enabled } });
        if (!connector.enabled) return perform(run, `${NAMES[connector.name]}: switched on. Connect again from claude.ai.`);
        confirmThen(`switch-${connector.name}`, run, `${NAMES[connector.name]}: switched off, and every connection revoked.`);
    }

    const shown = (connectors.data ?? []).filter(c => c.configured || c.name === 'chat');
    const live = (connections.data ?? []).filter(c => !c.ended_at);
    const ended = (connections.data ?? []).filter(c => c.ended_at).slice(0, 5);

    return (
        <div className="editor claude-section">
            {message && <p className="editor-message" role="status">{message}</p>}
            {connectors.loading && <p className="editor-message">Loading…</p>}
            <ul className="editor-list">
                {shown.map(connector => (
                    <li key={connector.name} className="editor-item">
                        <div className="editor-row">
                            <div className="editor-text">
                                <span className="editor-title">{NAMES[connector.name]}: {connector.configured ? (connector.enabled ? 'on' : 'off') : 'not set up'}</span>
                                <span className="editor-detail">
                                    {connector.configured ? connector.url : 'Set up on the server first (vm/CONNECTOR.md).'}
                                    {connector.configured && connector.write_cap !== undefined && ` · ${connector.writes_today} of ${connector.write_cap} changes today`}
                                </span>
                            </div>
                            {connector.configured && (
                                <div className="editor-buttons">
                                    <button
                                        type="button"
                                        className={connector.enabled ? `editor-danger${armed === `switch-${connector.name}` ? ' armed' : ''}` : 'editor-primary'}
                                        onClick={() => toggle(connector)}
                                    >
                                        {!connector.enabled ? 'Switch on' : armed === `switch-${connector.name}` ? 'Tap again to switch off' : 'Switch off'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </li>
                ))}
            </ul>

            <div className="editor-section">
                <h3>Connections</h3>
                {connections.data?.length === 0 && <p className="editor-message">Nothing has connected yet.</p>}
                <ul className="editor-list">
                    {live.map(c => (
                        <li key={c.id} className="editor-item">
                            <div className="editor-row">
                                <div className="editor-text">
                                    <span className="editor-title">{NAMES[c.connector]}</span>
                                    <span className="editor-detail">Connected {when(c.created_at)} · last used {when(c.last_used_at ?? c.created_at)}</span>
                                </div>
                                <div className="editor-buttons">
                                    <button
                                        type="button"
                                        className={`editor-danger${armed === `revoke-${c.id}` ? ' armed' : ''}`}
                                        onClick={() => confirmThen(`revoke-${c.id}`, () => request(`/connections/${c.id}/revoke`, { method: 'POST' }), 'Revoked. That connection has stopped working.')}
                                    >
                                        {armed === `revoke-${c.id}` ? 'Tap again to revoke' : 'Revoke'}
                                    </button>
                                </div>
                            </div>
                        </li>
                    ))}
                    {ended.map(c => (
                        <li key={c.id} className="editor-item">
                            <div className="editor-row">
                                <div className="editor-text">
                                    <span className="editor-title editor-optional">{NAMES[c.connector]}, ended {when(c.ended_at)}</span>
                                    <span className="editor-detail">{c.end_reason_text}</span>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="editor-section">
                <h3>Claude&apos;s changes</h3>
                <ClaudeChanges />
            </div>
        </div>
    );
}
