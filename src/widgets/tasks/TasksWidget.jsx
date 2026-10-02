import { useCallback, useRef, useState } from 'react';
import { daysBetween, today } from '../../../shared/dates';
import { minutesLabel, splitTasks } from '../../../shared/tasks';
import ClaudeMark from '../../components/ClaudeMark';
import EditButton from '../../components/EditButton';
import Menu from '../../components/Menu';
import { TasksEditor } from '../../editors/editors';
import { useHiddenCount } from '../../hooks/useHiddenCount';
import { useIsKiosk } from '../../hooks/useKiosk';
import { useNow } from '../../hooks/useNow';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useResource } from '../../hooks/useResource';
import { dueLabel, isUrgent } from '../assignments/daysLabel';
import { QUICK_MINUTES, SORTS, filterLabel, useTaskView, viewTasks } from './taskView';
import './TasksWidget.css';

// Every open task but the assignments (docs/BLOCKS.md §3): now → soon →
// someday, then due date, then shortest first, unless sorted otherwise, and
// filtered by area or "15 min or less" from the header. Tapping a row
// completes it after 5 seconds; tapping again cancels. Completed tasks get
// done_at and can be restored; a recurring one moves to its next due date.
export default function TasksWidget() {
    const tasks = useResource('tasks', { params: { done: false } });
    const settings = useResource('settings');
    const areas = useResource('areas');
    const todayDate = today(useNow());
    const [view, changeView] = useTaskView(useIsKiosk());
    const { update, create } = tasks;
    const complete = useCallback(id => update(id, { done_at: new Date().toISOString() }), [update]);
    const pending = usePendingAction(complete);

    // a filter on an area that's since been deleted shows every area
    const areaList = areas.data ?? [];
    const shownView = { ...view, area: areaList.some(a => a.id === view.area) ? view.area : null };
    const label = filterLabel(shownView, areaList);

    return (
        <div className="widget tasks-widget">
            <div className="widget-header">
                <p className="widget-title">Tasks{label && ` · ${label}`}</p>
                <div className="widget-actions">
                    <Menu label="Sort" sections={[{
                        items: Object.entries(SORTS).map(([key, name]) => ({ key, label: name, checked: view.sort === key, onSelect: () => changeView({ sort: key }) })),
                    }]} />
                    <Menu label="Filter" sections={[
                        { title: 'Area', items: [{ id: null, name: 'All areas' }, ...areaList].map(a => ({ key: a.id ?? 'all', label: a.name, checked: shownView.area === a.id, onSelect: () => changeView({ area: a.id }) })) },
                        { title: 'Time', items: [{ key: 'quick', label: `${QUICK_MINUTES} min or less`, toggle: true, checked: view.quick, onSelect: () => changeView({ quick: !view.quick }) }] },
                    ]} />
                    <EditButton title="Tasks" editor={TasksEditor} onClosed={tasks.refresh} />
                </div>
            </div>
            <TaskList tasks={tasks} settings={settings} view={shownView} pending={pending} todayDate={todayDate} />
            {!tasks.loading && tasks.data && <AddTask onAdd={name => create({ name })} />}
            {tasks.saveError && <p className="widget-notice" role="status">Couldn't save. {tasks.saveError.message}</p>}
        </div>
    );
}

function TaskList({ tasks, settings, view, pending, todayDate }) {
    // filtered at render time: a completed task leaves the view as soon as
    // done_at is set, and the assignments are in their own tile
    const open = tasks.data && settings.data
        ? viewTasks(splitTasks(tasks.data.filter(t => !t.done_at), settings.data.assignments_area).tasks, view)
        : [];
    const listRef = useRef(null);
    const hidden = useHiddenCount(listRef, `${view.sort}|${open.map(t => t.id).join(',')}`, open.length);

    if (tasks.loading || settings.loading) return <p className="widget-message">Loading…</p>;
    if (!tasks.data || !settings.data) return <p className="widget-message">Couldn't load tasks. {(tasks.error ?? settings.error)?.message}</p>;
    if (open.length === 0) {
        const filtered = view.area !== null || view.quick;
        return <p className="widget-message">{filtered ? 'Nothing here with this filter.' : 'No tasks! Time to relax!'}</p>;
    }

    // when the tile is full, the last rows fold into "+N more": someday tasks go first
    const shown = open.slice(0, open.length - hidden);
    // in the default order, a divider before the someday tasks
    const firstSomeday = view.sort === 'priority' ? shown.findIndex(t => t.priority === 'someday') : -1;

    return (
        <ul className="tasks-list" ref={listRef}>
            {shown.map((t, i) => (
                <TaskRow key={t.id} task={t} pending={pending} todayDate={todayDate} onUndone={tasks.refresh} divider={i === firstSomeday} />
            ))}
            {hidden > 0 && <li className="task-more">+{hidden} more</li>}
        </ul>
    );
}

// The row, left to right: the checkbox, "!" for now, the name, ↻ when it
// repeats, the due date, the time chip, and ✦ on what Claude added
function TaskRow({ task: t, pending, todayDate, onUndone, divider }) {
    const isPending = pending.isPending(t.id);
    const days = t.due ? daysBetween(todayDate, t.due) : null;
    return (
        <>
            {divider && <li className="task-divider" role="separator">Someday</li>}
            <li className={['task', isPending && 'pending', t.priority === 'someday' && 'someday'].filter(Boolean).join(' ')} style={{'--pending-ms': `${pending.delayMs}ms`}}>
                {/* the whole row is the label, so a tap anywhere on it toggles the checkbox (DESIGN §6.1) */}
                <label data-tap>
                    <input type="checkbox" checked={isPending} onChange={() => pending.toggle(t.id)} />
                    {/* the column stays when empty, so the names line up */}
                    <span className="task-now" aria-label={t.priority === 'now' ? 'now' : undefined}>{t.priority === 'now' ? '!' : ''}</span>
                    <span className="task-name">{t.name}</span>
                    {t.repeat && <span className="task-repeat" aria-label="repeats">↻</span>}
                    {t.due && <span className={isUrgent(days) ? 'task-due urgent' : 'task-due'}>{dueLabel(todayDate, t.due)}</span>}
                    <span className={chipClass(t.minutes)}>{minutesLabel(t.minutes)}</span>
                </label>
                {t.claude_change && <ClaudeMark change={t.claude_change} name={t.name} onUndone={onUndone} />}
            </li>
        </>
    );
}

// the time chip: green for 15 minutes or less, violet over an hour; always
// there, even empty, so the due dates line up
function chipClass(minutes) {
    if (!minutes) return 'task-chip';
    if (minutes <= QUICK_MINUTES) return 'task-chip quick';
    return minutes > 60 ? 'task-chip long' : 'task-chip';
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
