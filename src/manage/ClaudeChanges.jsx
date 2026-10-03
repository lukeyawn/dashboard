import { useState } from 'react';
import { useResource } from '../hooks/useResource';
import { request } from '../lib/api';
import { describeChange, describeSkipped, whoMade } from './describeChange';
import '../editors/editors.css';

const SOURCES = [['', 'All of Claude'], ['claude.ai', 'claude.ai only'], ['claude-code', 'Claude Code only']];
const PERIODS = [['hour', 'the last hour'], ['today', 'today'], ['custom', 'a time I pick']];
const SCOPES = [['claude.ai', 'claude.ai only'], ['all', 'claude.ai and Claude Code']];

const time = at => new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const day = at => new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

function sinceOf(period, custom) {
    if (period === 'hour') return new Date(Date.now() - 60 * 60 * 1000).toISOString();
    if (period === 'today') {
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        return midnight.toISOString();
    }
    const picked = new Date(custom);
    return Number.isNaN(picked.getTime()) ? null : picked.toISOString();
}

// Everything Claude did, from the change record, each with Undo, plus Undo
// everything since a time (docs/CONNECTOR.md §6). That covers claude.ai only
// unless widened: claude.ai is the door a fooled agent comes through, and a
// bad run shouldn't cost legitimate Claude Code work.
export default function ClaudeChanges() {
    const [via, setVia] = useState('');
    const changes = useResource('changes', { params: { limit: 100, actor: 'claude,agent', via: via || undefined } });
    const [period, setPeriod] = useState('hour');
    const [custom, setCustom] = useState('');
    const [scope, setScope] = useState('claude.ai');
    const [armed, setArmed] = useState(false);
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

    async function undoSince() {
        const since = sinceOf(period, custom);
        if (!since) return setMessage('Pick a time first.');
        if (!armed) return setArmed(true);
        setArmed(false);
        try {
            const { undone, skipped } = await request('/changes/undo-since', {
                method: 'POST',
                body: { since, ...(scope === 'claude.ai' ? { via: 'claude.ai' } : {}) },
            });
            const parts = [`Undid ${undone.length} ${undone.length === 1 ? 'change' : 'changes'}.`];
            if (skipped.length) parts.push(describeSkipped(skipped));
            setMessage(parts.join(' '));
        } catch (err) {
            setMessage(`Couldn't undo. ${err.message}`);
        }
        changes.refresh();
    }

    const rows = changes.data ?? [];
    const days = [];
    for (const change of rows) {
        const label = day(change.at);
        if (days.at(-1)?.label !== label) days.push({ label, changes: [] });
        days.at(-1).changes.push(change);
    }

    return (
        <div className="editor claude-changes">
            <div className="editor-toolbar">
                <label>
                    <span className="editor-label">Since</span>
                    <select value={period} onChange={event => { setPeriod(event.target.value); setArmed(false); }}>
                        {PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>
                {period === 'custom' && (
                    <label>
                        <span className="editor-label">Time</span>
                        <input type="datetime-local" value={custom} onChange={event => { setCustom(event.target.value); setArmed(false); }} />
                    </label>
                )}
                <label>
                    <span className="editor-label">From</span>
                    <select value={scope} onChange={event => { setScope(event.target.value); setArmed(false); }}>
                        {SCOPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>
            </div>
            <div className="editor-buttons">
                <button type="button" className={armed ? 'editor-danger armed' : 'editor-danger'} onClick={undoSince}>
                    {armed ? 'Tap again to undo them all' : 'Undo everything since'}
                </button>
            </div>
            {message && <p className="editor-message" role="status">{message}</p>}

            <div className="editor-toolbar">
                <label>
                    <span className="editor-label">Show</span>
                    <select value={via} onChange={event => setVia(event.target.value)}>
                        {SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>
            </div>
            {changes.loading && <p className="editor-message">Loading…</p>}
            {!changes.loading && !changes.data && <p className="editor-message">Couldn't load Claude's changes.</p>}
            {changes.data?.length === 0 && <p className="editor-message">Claude hasn't changed anything yet.</p>}
            {days.map(group => (
                <div key={group.label} className="editor-section">
                    <h3>{group.label}</h3>
                    <ul className="editor-list">
                        {group.changes.map(change => (
                            <li key={change.id} className="editor-item">
                                <div className="editor-row">
                                    <div className="editor-text">
                                        <span className="editor-title">{describeChange(change)}</span>
                                        <span className="editor-detail">{whoMade(change)} · {time(change.at)}</span>
                                    </div>
                                    <div className="editor-buttons">
                                        <button type="button" onClick={() => undo(change)}>Undo</button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}
