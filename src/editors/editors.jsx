// The editor for each resource, configuring ResourceEditor (DESIGN §6.3).
import { useState } from 'react';
import { STAGE_NAMES, compareApplications, isArchived } from '../../shared/applications';
import { DETAILS, countdownProblems, formatClock } from '../../shared/countdowns';
import * as schemas from '../../shared/schemas';
import { parseDate } from '../../shared/dates';
import { describeRepeat } from '../../shared/repeat';
import { compareTasks, minutesLabel } from '../../shared/tasks';
import { formatNumber } from '../lib/format';
import { streakText } from '../widgets/habits/habitText';
import { stepWhen } from '../widgets/job/jobText';
import { Choice } from './EditorForm';
import ResourceEditor from './ResourceEditor';
import { AreaInput, RepeatInput } from './taskFields';

const now = () => new Date().toISOString();
const shortDate = date => parseDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const recentFirst = (a, b) => (b.done_at ?? b.archived_at ?? '').localeCompare(a.done_at ?? a.archived_at ?? '');

const PRIORITY_LABELS = { now: 'Now', soon: 'Soon', someday: 'Someday' };

// One list for to-dos and deadlines; a due date makes a task a deadline (DESIGN §3).
// Areas come from a list, priority is when you mean to do it, and a recurring
// task moves to its next due date when completed (docs/BLOCKS.md §3).
export function TasksEditor() {
    const fields = [
        { key: 'name', label: 'Task' },
        { key: 'due', label: 'Due', type: 'date', optional: true },
        { key: 'priority', label: 'When', type: 'choice', options: schemas.PRIORITIES, labels: PRIORITY_LABELS, default: 'soon' },
        { key: 'area_id', label: 'Area', type: 'custom', optional: true, render: props => <AreaInput {...props} /> },
        { key: 'minutes', label: 'Time it takes', type: 'select', options: ['', 5, 15, 30, 60, 120], labels: { 120: '60+' }, optional: true },
        { key: 'repeat', label: 'Repeats', type: 'custom', optional: true, render: props => <RepeatInput {...props} /> },
        { key: 'notes', label: 'Notes', type: 'textarea', optional: true },
        { key: 'link', label: 'Link', optional: true, placeholder: 'https://' },
    ];
    return (
        <ResourceEditor
            resource="tasks"
            noun="task"
            fields={fields}
            // a new task leaves out what isn't filled in
            createFields={fields.map(f => (f.optional ? { ...f, optional: false, omitEmpty: true } : f))}
            createSchema={schemas.taskCreate}
            updateSchema={schemas.taskUpdate}
            filters={[
                { key: 'priority', label: 'When', options: schemas.PRIORITIES },
                { key: 'area', label: 'Area', options: rows => [...new Set(rows.map(r => r.area).filter(Boolean))].sort() },
            ]}
            sorts={[
                { label: 'When, then due', compare: compareTasks },
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
                    t.priority !== 'soon' && PRIORITY_LABELS[t.priority].toLowerCase(),
                    minutesLabel(t.minutes),
                    t.repeat && describeRepeat(t.repeat),
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
// The task areas (docs/BLOCKS.md §3): add, rename, reorder and delete.
// Deleting one clears it from its tasks; Undo in History puts it back on them.
export function AreasEditor() {
    return (
        <ResourceEditor
            resource="areas"
            noun="area"
            fields={[{ key: 'name', label: 'Area' }]}
            createSchema={schemas.areaCreate}
            updateSchema={schemas.areaUpdate}
            sections={rows => [{ title: null, rows }]}
            describe={a => ({ title: a.name, detail: null })}
            actions={(a, rows) => {
                const index = rows.findIndex(r => r.id === a.id);
                return [
                    index > 0 && { label: '↑', changes: { position: index - 1 } },
                    index < rows.length - 1 && { label: '↓', changes: { position: index + 1 } },
                ].filter(Boolean);
            }}
        />
    );
}

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

// Goals and milestones (docs/BLOCKS.md §5); the fields follow the kind, which
// is chosen when the goal is made
const isProgress = values => values.kind !== 'milestone';
const GOAL_FIELDS = [
    { key: 'name', label: 'Goal' },
    { key: 'current', label: 'Progress so far', type: 'number', default: '0', when: isProgress },
    { key: 'target', label: 'Target', type: 'number', when: isProgress },
    { key: 'unit', label: 'Unit', optional: true, placeholder: 'e.g. books, mi', when: isProgress },
    { key: 'step', label: 'Each + adds', type: 'number', placeholder: '1', when: isProgress },
    { key: 'deadline', label: 'Deadline', type: 'date', optional: true },
    { key: 'started', label: 'Counting from', type: 'date', omitEmpty: true, when: isProgress },
];
const KIND_FIELD = { key: 'kind', label: 'Kind', type: 'choice', options: schemas.GOAL_KINDS, labels: { progress: 'Progress', milestone: 'Milestone' }, default: 'progress' };

// "12/50 books · by Dec 31", "Milestone · by Dec 31", "Achieved Oct 1"
function describeGoal(g) {
    const parts = [
        g.kind === 'milestone' ? 'Milestone' : `${formatNumber(g.current)}/${formatNumber(g.target)}${g.unit ? ` ${g.unit}` : ''}`,
        g.deadline && `by ${shortDate(g.deadline)}`,
        g.achieved_at && `Achieved ${new Date(g.achieved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    ];
    return { title: g.name, detail: parts.filter(Boolean).join(' · ') };
}

export function GoalsEditor() {
    return (
        <ResourceEditor
            resource="goals"
            noun="goal"
            params={{ dream: false }}
            fields={GOAL_FIELDS}
            createFields={[KIND_FIELD, ...GOAL_FIELDS]}
            createSchema={schemas.goalCreate}
            updateSchema={schemas.goalUpdate}
            sections={rows => [
                { title: null, rows: rows.filter(g => !g.archived_at) },
                { title: 'Archived', rows: rows.filter(g => g.archived_at).sort(recentFirst) },
            ]}
            describe={describeGoal}
            actions={g => [g.archived_at ? { label: 'Unarchive', changes: { archived_at: null } } : { label: 'Archive', changes: { archived_at: now() } }]}
        />
    );
}

// Long-horizon goals, kept off the tile until one is made a goal
export function DreamsEditor() {
    return (
        <ResourceEditor
            resource="goals"
            noun="dream"
            params={{ dream: true }}
            fields={GOAL_FIELDS}
            createFields={[KIND_FIELD, ...GOAL_FIELDS.filter(f => f.key !== 'deadline')]}
            createValues={{ dream: true }}
            createSchema={schemas.goalCreate}
            updateSchema={schemas.goalUpdate}
            sections={rows => [{ title: null, rows }]}
            describe={describeGoal}
            actions={() => [{ label: 'Make it a goal', changes: { dream: false } }]}
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

// Rejected and withdrawn are archived: off the tile, and behind the Show
// filter here (docs/BLOCKS.md §6)
export function ApplicationsEditor() {
    const fields = [
        { key: 'company', label: 'Company' },
        { key: 'role', label: 'Role' },
        { key: 'status', label: 'Stage', type: 'select', options: schemas.STATUSES, labels: STAGE_NAMES, default: 'applied' },
        { key: 'applied_on', label: 'Applied on', type: 'date', optional: true },
        // the OA's due date, the interview's day, or the day an offer needs a reply by
        { key: 'next_on', label: 'Next step date', type: 'date', optional: true },
        { key: 'next_time', label: 'Next step time', type: 'time', optional: true, when: values => Boolean(values.next_on) },
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
            filters={[{ key: 'archived', label: 'Show', options: ['Open', 'Archived'], value: a => (isArchived(a) ? 'Archived' : 'Open'), initial: 'Open' }]}
            sorts={[
                { label: 'As on the tile', compare: compareApplications },
                { label: 'Recently applied', compare: (a, b) => b.applied_on.localeCompare(a.applied_on) || b.id - a.id },
            ]}
            sections={rows => [{ title: null, rows }]}
            describe={a => ({
                title: `${a.company} · ${a.role}`,
                detail: [STAGE_NAMES[a.status], stepWhen(a), `applied ${shortDate(a.applied_on)}`].filter(Boolean).join(' · '),
            })}
        />
    );
}
