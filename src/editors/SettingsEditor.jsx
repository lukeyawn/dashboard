import { useState } from 'react';
import { WEEK_STARTS } from '../../shared/dates';
import * as schemas from '../../shared/schemas';
import { useResource } from '../hooks/useResource';
import { request } from '../lib/api';
import { formatTime } from '../lib/format';
import EditorForm from './EditorForm';
import './editors.css';

// Night hours, the day weeks start on, the Assignments tile's area, and
// starting or cancelling night mode now (DESIGN §6.4)
export default function SettingsEditor() {
    const settings = useResource('settings');
    const night = useResource('night');
    const areas = useResource('areas');
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

    if (!settings.data || !night.data || !areas.data) {
        return <p className="editor-message">{settings.error || night.error || areas.error ? "Couldn't load settings." : 'Loading…'}</p>;
    }
    // no area while the chosen one has been deleted, until another is picked
    const areaIds = areas.data.map(a => a.id);
    const areaOptions = settings.data.assignments_area === null ? ['', ...areaIds] : areaIds;

    return (
        <div className="editor">
            <EditorForm
                key={`${settings.data.night_start}-${settings.data.night_end}-${settings.data.week_start}-${settings.data.assignments_area}`}
                fields={[
                    { key: 'night_start', label: 'Night starts', type: 'time' },
                    { key: 'night_end', label: 'Night ends', type: 'time' },
                    // for habits' weekly targets (docs/BLOCKS.md §2)
                    { key: 'week_start', label: 'Weeks start on', type: 'select', options: WEEK_STARTS, labels: { sunday: 'Sunday', monday: 'Monday' } },
                    // its tasks with a due date go on the Assignments tile (docs/BLOCKS.md §3)
                    { key: 'assignments_area', label: 'Assignments area', type: 'select', options: areaOptions, labels: { '': 'Pick an area', ...Object.fromEntries(areas.data.map(a => [a.id, a.name])) } },
                ]}
                schema={schemas.settingsUpdate}
                initial={settings.data}
                onlyChanges
                submitLabel="Save settings"
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
