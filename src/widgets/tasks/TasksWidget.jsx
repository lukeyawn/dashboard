import { useCallback, useState } from 'react';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useResource } from '../../hooks/useResource';
import './TasksWidget.css';
import EditButton from '../../components/EditButton';
import { TasksEditor } from '../../editors/editors';

// Open tasks, oldest first (DESIGN §10). Tapping a row clears it after 5
// seconds; tapping again cancels. Cleared tasks get done_at and can be restored.
export default function TasksWidget() {
    const tasks = useResource('tasks', { params: { done: false } });
    const { update, create } = tasks;
    const complete = useCallback(id => update(id, { done_at: new Date().toISOString() }), [update]);
    const pending = usePendingAction(complete);

    return (
        <div className="widget tasks-widget">
            <div className="widget-header">
                <p className="widget-title">Tasks</p>
                <EditButton title="Tasks" editor={TasksEditor} onClosed={tasks.refresh} />
            </div>
            <TaskList tasks={tasks} pending={pending} />
            {!tasks.loading && tasks.data && <AddTask onAdd={name => create({ name })} />}
            {tasks.saveError && <p className="widget-notice" role="status">Couldn't save. {tasks.saveError.message}</p>}
        </div>
    );
}

function TaskList({ tasks, pending }) {
    if (tasks.loading) return <p className="widget-message">Loading…</p>;
    if (!tasks.data) return <p className="widget-message">Couldn't load tasks. {tasks.error?.message}</p>;

    // filtered at render time: a completed task leaves the view as soon as done_at is set
    const open = tasks.data.filter(t => !t.done_at);
    if (open.length === 0) return <p className="widget-message">No tasks! Time to relax!</p>;

    return (
        <ul className="tasks-list">
            {open.map(t => {
                const isPending = pending.isPending(t.id);
                return (
                    <li key={t.id} className={isPending ? 'task pending' : 'task'} style={{'--pending-ms': `${pending.delayMs}ms`}}>
                        {/* the whole row is the label, so a tap anywhere on it toggles the checkbox (DESIGN §6.1) */}
                        <label data-tap>
                            <span className="task-name">{t.name}</span>
                            <input type="checkbox" checked={isPending} onChange={() => pending.toggle(t.id)} />
                        </label>
                    </li>
                );
            })}
        </ul>
    );
}

// The inline "+ Add task" row (DESIGN §6.3). Keeps the text if saving fails.
function AddTask({ onAdd }) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);

    async function submit(event) {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || saving) return;
        setSaving(true);
        const created = await onAdd(trimmed);
        setSaving(false);
        if (created) setName('');
    }

    return (
        <form className="task-add" onSubmit={submit}>
            <input
                aria-label="New task"
                placeholder="+ Add task"
                value={name}
                onChange={event => setName(event.target.value)}
                maxLength={200}
                enterKeyHint="done"
                inputMode="text"
                autoComplete="off"
                data-tap
            />
        </form>
    );
}
