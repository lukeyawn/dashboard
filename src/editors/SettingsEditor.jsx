import { useState } from 'react';
import * as schemas from '../../shared/schemas';
import { useResource } from '../hooks/useResource';
import { request } from '../lib/api';
import { formatTime } from '../lib/format';
import EditorForm from './EditorForm';
import './editors.css';

// Night hours, and starting or cancelling night mode now (DESIGN §6.4)
export default function SettingsEditor() {
    const settings = useResource('settings');
    const night = useResource('night');
    const [error, setError] = useState(null);

    async function run(method, path, body) {
        try {
            await request(path, { method, body });
            setError(null);
            await Promise.all([settings.refresh(), night.refresh()]);
            return true;
        } catch (err) {
            setError(err.message);
            return null;
        }
    }

    if (!settings.data || !night.data) {
        return <p className="editor-message">{settings.error || night.error ? "Couldn't load settings." : 'Loading…'}</p>;
    }

    return (
        <div className="editor">
            <EditorForm
                key={`${settings.data.night_start}-${settings.data.night_end}`}
                fields={[
                    { key: 'night_start', label: 'Night starts', type: 'time' },
                    { key: 'night_end', label: 'Night ends', type: 'time' },
                ]}
                schema={schemas.settingsUpdate}
                initial={settings.data}
                onlyChanges
                submitLabel="Save night hours"
                onSubmit={changes => run('PATCH', '/settings', changes)}
            />
            <div className="editor-row">
                <div className="editor-text">
                    <span className="editor-title">Night mode is {night.data.active ? 'on' : 'off'}</span>
                    {night.data.active && <span className="editor-detail">until {formatTime(new Date(night.data.until))}</span>}
                </div>
                <div className="editor-buttons">
                    {night.data.early && <button type="button" onClick={() => run('POST', '/night/cancel')}>Cancel early start</button>}
                    {!night.data.active && <button type="button" onClick={() => run('POST', '/night/start')}>Start night now</button>}
                </div>
            </div>
            {error && <p className="editor-error" role="status">{error}</p>}
        </div>
    );
}
