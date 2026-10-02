// The editor for each resource, configuring ResourceEditor (DESIGN §6.3).
import { useState } from 'react';
import { DETAILS, countdownProblems, formatClock } from '../../shared/countdowns';
import * as schemas from '../../shared/schemas';
import { parseDate } from '../../shared/dates';
import { compareTasks } from '../../shared/tasks';
import { formatNumber } from '../lib/format';
import { streakText } from '../widgets/habits/habitText';
import { Choice } from './EditorForm';
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

const DETAIL_LABELS = { days: 'Days', hours: 'Hours', live: 'Live' };

// Current countdowns, or the past ones to review and delete. A date that has
// passed is refused with the server's own message, beside the field (docs/BLOCKS.md §4).
export function CountdownsEditor() {
    const [past, setPast] = useState(false);
    return (
        <>
            <div className="editor">
                <Choice options={['current', 'past']} labels={{ current: 'Current', past: 'Past' }} value={past ? 'past' : 'current'} onChange={v => setPast(v === 'past')} />
            </div>
            <ResourceEditor
                key={past ? 'past' : 'current'}
                resource="countdowns"
                noun="countdown"
                params={past ? { past: true } : undefined}
                fields={[
                    { key: 'label', label: 'Counting down to' },
                    { key: 'target_date', label: 'Date', type: 'date' },
                    { key: 'target_time', label: 'Time', type: 'time', optional: true },
                    { key: 'detail', label: 'Show', type: 'choice', options: DETAILS, labels: DETAIL_LABELS, default: 'days' },
                    { key: 'pinned', label: 'Pinned (shown unless a birthday is within a week)', type: 'checkbox' },
                ]}
                createSchema={schemas.countdownCreate}
                updateSchema={schemas.countdownUpdate}
                check={(values, before) => countdownProblems(values, new Date(), before)}
                sections={rows => [{ title: null, rows }]}
                describe={c => ({
                    title: `${c.pinned ? '📌 ' : ''}${c.label}`,
                    detail: [shortDate(c.target_date), c.target_time && formatClock(c.target_time), c.detail !== 'days' && DETAIL_LABELS[c.detail].toLowerCase()].filter(Boolean).join(' · '),
                })}
                actions={c => [c.pinned ? { label: 'Unpin', changes: { pinned: false } } : { label: 'Pin', changes: { pinned: true } }]}
            />
        </>
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
            fields={[
                { key: 'name', label: 'Habit' },
                // a weekly target (docs/BLOCKS.md §2)
                { key: 'per_week', label: 'Days a week (7 is daily)', type: 'select', options: [7, 6, 5, 4, 3, 2, 1], default: '7' },
            ]}
            createSchema={schemas.habitCreate}
            updateSchema={schemas.habitUpdate}
            sections={rows => [
                { title: null, rows: rows.filter(h => !h.archived_at) },
                { title: 'Archived', rows: rows.filter(h => h.archived_at).sort(recentFirst) },
            ]}
            describe={h => ({ title: h.name, detail: [h.per_week < 7 && `${h.per_week} a week`, streakText(h)].filter(Boolean).join(' · ') || null })}
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
