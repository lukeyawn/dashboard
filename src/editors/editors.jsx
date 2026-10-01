// The editor for each resource, configuring ResourceEditor (DESIGN §6.3).
import * as schemas from '../../shared/schemas';
import { parseDate } from '../../shared/dates';
import { compareTasks } from '../../shared/tasks';
import { formatNumber } from '../lib/format';
import ResourceEditor from './ResourceEditor';

const now = () => new Date().toISOString();
const shortDate = date => parseDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const recentFirst = (a, b) => (b.done_at ?? b.archived_at ?? '').localeCompare(a.done_at ?? a.archived_at ?? '');

// One list for to-dos and deadlines; a due date makes a task a deadline (DESIGN §3)
export function TasksEditor() {
    const fields = [
        { key: 'name', label: 'Task' },
        { key: 'due', label: 'Due', type: 'date', optional: true },
        { key: 'priority', label: 'Priority', type: 'select', options: schemas.PRIORITIES, default: 'normal' },
        { key: 'effort', label: 'Effort', type: 'select', options: ['', ...schemas.EFFORTS], optional: true },
        { key: 'area', label: 'Area', optional: true, placeholder: 'e.g. CS 439, job search, home' },
        { key: 'notes', label: 'Notes', type: 'textarea', optional: true },
        { key: 'link', label: 'Link', optional: true, placeholder: 'https://' },
    ];
    return (
        <ResourceEditor
            resource="tasks"
            noun="task"
            fields={fields}
            // a new task leaves out what isn't filled in; the server picks normal priority
            createFields={fields.map(f => (f.optional ? { ...f, optional: false, omitEmpty: true } : f))}
            createSchema={schemas.taskCreate}
            updateSchema={schemas.taskUpdate}
            filters={[
                { key: 'priority', label: 'Priority', options: schemas.PRIORITIES },
                { key: 'effort', label: 'Effort', options: schemas.EFFORTS },
                { key: 'area', label: 'Area', options: rows => [...new Set(rows.map(r => r.area).filter(Boolean))].sort() },
            ]}
            sorts={[
                { label: 'Priority, then due', compare: compareTasks },
                { label: 'Due date', compare: (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.id - b.id },
                { label: 'Newest', compare: (a, b) => b.id - a.id },
            ]}
            sections={rows => [
                { title: null, rows: rows.filter(t => !t.done_at) },
                // cleared tasks can be restored (DESIGN §6.2)
                { title: 'Completed', rows: rows.filter(t => t.done_at).sort(recentFirst).slice(0, 20) },
            ]}
            describe={t => ({
                title: t.name,
                detail: [
                    t.due && `due ${shortDate(t.due)}`,
                    t.priority !== 'normal' && `${t.priority} priority`,
                    t.effort,
                    t.area,
                ].filter(Boolean).join(' · ') || null,
            })}
            actions={t => (t.done_at ? [{ label: 'Restore', changes: { done_at: null } }] : [{ label: 'Done', changes: { done_at: now() } }])}
        />
    );
}

export function CountdownsEditor() {
    return (
        <ResourceEditor
            resource="countdowns"
            noun="countdown"
            fields={[
                { key: 'label', label: 'Counting down to' },
                { key: 'target_date', label: 'Date', type: 'date' },
                { key: 'pinned', label: 'Pinned (shown unless a birthday is within a week)', type: 'checkbox' },
            ]}
            createSchema={schemas.countdownCreate}
            updateSchema={schemas.countdownUpdate}
            sections={rows => [{ title: null, rows }]}
            describe={c => ({ title: `${c.pinned ? '📌 ' : ''}${c.label}`, detail: shortDate(c.target_date) })}
            actions={c => [c.pinned ? { label: 'Unpin', changes: { pinned: false } } : { label: 'Pin', changes: { pinned: true } }]}
        />
    );
}

export function GoalsEditor() {
    const fields = [
        { key: 'name', label: 'Goal' },
        { key: 'current', label: 'Progress so far', type: 'number', default: '0' },
        { key: 'target', label: 'Target', type: 'number' },
        { key: 'unit', label: 'Unit', optional: true, placeholder: 'e.g. books, mi' },
    ];
    return (
        <ResourceEditor
            resource="goals"
            noun="goal"
            fields={fields}
            createSchema={schemas.goalCreate}
            updateSchema={schemas.goalUpdate}
            sections={rows => [
                { title: null, rows: rows.filter(g => !g.archived_at) },
                { title: 'Archived', rows: rows.filter(g => g.archived_at).sort(recentFirst) },
            ]}
            describe={g => ({ title: g.name, detail: `${formatNumber(g.current)}/${formatNumber(g.target)}${g.unit ? ` ${g.unit}` : ''}` })}
            actions={g => [g.archived_at ? { label: 'Unarchive', changes: { archived_at: null } } : { label: 'Archive', changes: { archived_at: now() } }]}
        />
    );
}

export function HabitsEditor() {
    return (
        <ResourceEditor
            resource="habits"
            noun="habit"
            params={{ days: 7 }}
            fields={[{ key: 'name', label: 'Habit' }]}
            createSchema={schemas.habitCreate}
            updateSchema={schemas.habitUpdate}
            sections={rows => [
                { title: null, rows: rows.filter(h => !h.archived_at) },
                { title: 'Archived', rows: rows.filter(h => h.archived_at).sort(recentFirst) },
            ]}
            describe={h => ({ title: h.name, detail: h.streak > 0 ? `${h.streak}-day streak` : null })}
            actions={h => [h.archived_at ? { label: 'Unarchive', changes: { archived_at: null } } : { label: 'Archive', changes: { archived_at: now() } }]}
        />
    );
}

export function ApplicationsEditor() {
    const fields = [
        { key: 'company', label: 'Company' },
        { key: 'role', label: 'Role' },
        { key: 'status', label: 'Status', type: 'select', options: schemas.STATUSES, default: 'applied' },
        { key: 'applied_on', label: 'Applied on', type: 'date', optional: true },
        { key: 'url', label: 'Link', optional: true, placeholder: 'https://' },
        { key: 'notes', label: 'Notes', type: 'textarea', optional: true },
    ];
    return (
        <ResourceEditor
            resource="applications"
            noun="application"
            fields={fields}
            // applied_on is left out of a new one when empty, so the server fills in today
            createFields={fields.map(f => (f.key === 'applied_on' ? { ...f, optional: false, omitEmpty: true } : f))}
            createSchema={schemas.applicationCreate}
            updateSchema={schemas.applicationUpdate}
            sections={rows => [
                { title: null, rows: rows.filter(a => a.status !== 'rejected') },
                { title: 'Rejected', rows: rows.filter(a => a.status === 'rejected') },
            ]}
            describe={a => ({ title: `${a.company} · ${a.role}`, detail: `${a.status} · applied ${shortDate(a.applied_on)}` })}
        />
    );
}
