// One change from the record (DESIGN §5.5) as a line a person reads in History:
// "Completed task "Pset 4"", "Claude added task "Buy milk"".
import { STAGE_NAMES } from '../../shared/applications';
import { parseDate } from '../../shared/dates';
import { describeRepeat } from '../../shared/repeat';

const NOUNS = {
    tasks: 'task', areas: 'area', countdowns: 'countdown', goals: 'goal', habits: 'habit', applications: 'application',
};

export const ACTOR_LABELS = { owner: 'You', kiosk: 'Kiosk', claude: 'Claude', agent: 'Agent', system: 'System' };

// Who made a change, saying where Claude's came from (docs/CONNECTOR.md §6)
export function whoMade(change) {
    if (change.actor === 'claude' && change.via === 'claude.ai') return 'Claude (claude.ai)';
    if (change.actor === 'claude' && change.via === 'claude-code') return 'Claude Code';
    // the scheduled agent, through its own connector (docs/AGENT.md §3)
    if (change.actor === 'agent') return 'The agent';
    return ACTOR_LABELS[change.actor] ?? change.actor;
}

const CONNECTOR_SWITCHES = { connector_chat_enabled: 'the claude.ai connector', connector_agent_enabled: "the agent's connector" };

// fields that change as a side effect, not worth listing
const QUIET = new Set(['id', 'created_at', 'updated_at']);

function nameOf(row) {
    if (!row) return '';
    return row.name ?? row.label ?? (row.company ? `${row.company} · ${row.role}` : `#${row.id}`);
}

function shortDate(date) {
    return parseDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// the next occurrence of a recurring task, such as "Sun, Oct 4"
const weekdayOrDate = date => parseDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const show = (key, value) => {
    if (value === null || value === '' || value === undefined) return 'nothing';
    return key === 'repeat' ? describeRepeat(typeof value === 'string' ? JSON.parse(value) : value) : String(value);
};

function describeUpdate(noun, before, after) {
    const name = `${noun} "${nameOf(after)}"`;
    if (!before.done_at && after.done_at) return `Completed ${name}`;
    // a recurring task moves to its next due date when completed (docs/BLOCKS.md §3)
    if (after.last_done_at && before.last_done_at !== after.last_done_at) return `Completed ${name}, next ${weekdayOrDate(after.due)}`;
    if (before.done_at && !after.done_at) return `Restored ${name}`;
    // a goal reaching its target, or a milestone's Done, which also archives it (docs/BLOCKS.md §5)
    if (noun === 'goal' && !before.achieved_at && after.achieved_at) return `Achieved ${name}`;
    if (noun === 'goal' && before.dream !== after.dream) return after.dream ? `Made ${name} a dream` : `Made dream "${nameOf(after)}" a goal`;
    if (!before.archived_at && after.archived_at) return `Archived ${name}`;
    if (before.archived_at && !after.archived_at) return `Unarchived ${name}`;
    if (noun === 'countdown' && before.pinned !== after.pinned) return `${after.pinned ? 'Pinned' : 'Unpinned'} ${name}`;
    if (noun === 'goal' && before.current !== after.current) return `${name}: ${before.current} → ${after.current}`;
    if (noun === 'application' && before.status !== after.status) return `Moved ${name} to ${STAGE_NAMES[after.status] ?? after.status}`;
    // the next step (docs/BLOCKS.md §6)
    if (noun === 'application' && (before.next_on !== after.next_on || before.next_time !== after.next_time)) {
        return after.next_on ? `Set the next step of ${name}: ${[weekdayOrDate(after.next_on), after.next_time].filter(Boolean).join(', ')}` : `Cleared the next step of ${name}`;
    }
    const changed = Object.keys(after).filter(k => !QUIET.has(k) && before[k] !== after[k]);
    if (changed.length === 0) return `Changed ${name}`;
    return `Changed ${name}: ${changed.map(k => `${k.replace('_', ' ')} ${show(k, before[k])} → ${show(k, after[k])}`).join(', ')}`;
}

function describeSetting(change) {
    const key = change.item_id;
    if (key === 'night_early_until') return change.after ? 'Started night mode early' : 'Cancelled early night mode';
    if (CONNECTOR_SWITCHES[key]) return `Switched ${CONNECTOR_SWITCHES[key]} ${change.after?.value === false ? 'off' : 'on'}`;
    // an area id means nothing to read
    if (key === 'assignments_area') return change.after ? 'Changed the Assignments area' : 'Reset the Assignments area';
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
