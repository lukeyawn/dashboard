// One change from the record (DESIGN §5.5) as a line a person reads in History:
// "Completed task "Pset 4"", "Claude added task "Buy milk"".
import { parseDate } from '../../shared/dates';

const NOUNS = {
    tasks: 'task', countdowns: 'countdown', goals: 'goal', habits: 'habit', applications: 'application',
};

export const ACTOR_LABELS = { owner: 'You', kiosk: 'Kiosk', claude: 'Claude', agent: 'Agent', system: 'System' };

// fields that change as a side effect, not worth listing
const QUIET = new Set(['id', 'created_at', 'updated_at']);

function nameOf(row) {
    if (!row) return '';
    return row.name ?? row.label ?? (row.company ? `${row.company} · ${row.role}` : `#${row.id}`);
}

function shortDate(date) {
    return parseDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const show = value => (value === null || value === '' ? 'nothing' : String(value));

function describeUpdate(noun, before, after) {
    const name = `${noun} "${nameOf(after)}"`;
    if (!before.done_at && after.done_at) return `Completed ${name}`;
    if (before.done_at && !after.done_at) return `Restored ${name}`;
    if (!before.archived_at && after.archived_at) return `Archived ${name}`;
    if (before.archived_at && !after.archived_at) return `Unarchived ${name}`;
    if (noun === 'countdown' && before.pinned !== after.pinned) return `${after.pinned ? 'Pinned' : 'Unpinned'} ${name}`;
    if (noun === 'goal' && before.current !== after.current) return `${name}: ${before.current} → ${after.current}`;
    if (noun === 'application' && before.status !== after.status) return `Moved ${name} to ${after.status}`;
    const changed = Object.keys(after).filter(k => !QUIET.has(k) && before[k] !== after[k]);
    if (changed.length === 0) return `Changed ${name}`;
    return `Changed ${name}: ${changed.map(k => `${k.replace('_', ' ')} ${show(before[k])} → ${show(after[k])}`).join(', ')}`;
}

function describeSetting(change) {
    const key = change.item_id;
    if (key === 'night_early_until') return change.after ? 'Started night mode early' : 'Cancelled early night mode';
    const label = key.replace('_', ' ');
    return change.after ? `Set ${label} to ${change.after.value}` : `Reset ${label}`;
}

export function describeChange(change) {
    if (change.resource === 'settings') return describeSetting(change);
    if (change.resource === 'habit_checks') {
        const row = change.after ?? change.before;
        const habit = row.name ? `"${row.name}"` : 'a habit';
        return `${change.action === 'create' ? 'Checked' : 'Unchecked'} ${habit} for ${shortDate(row.date)}`;
    }
    const noun = NOUNS[change.resource] ?? change.resource;
    if (change.action === 'create') return `Added ${noun} "${nameOf(change.after)}"`;
    if (change.action === 'delete') return `Deleted ${noun} "${nameOf(change.before)}"`;
    return describeUpdate(noun, change.before, change.after);
}
