// Request schemas shared by the API, the frontend and the MCP server, so every
// way of putting data in goes through the same validation (DESIGN §4, §5).
import { z } from 'zod';
import { daysBetween, isDateString } from './dates.js';

const text = (max, label = 'Name') => z.string().trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

// an optional text field; an empty string clears it, which suits form inputs
const optionalText = max => z.preprocess(
    value => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max).nullable(),
).optional();

const timestamp = z.iso.datetime({ message: 'Expected a UTC ISO-8601 timestamp' });

// where an item came from, such as 'gmail:<message id>'; the server never
// creates a second item with the same source (DESIGN §5.5)
const source = z.string().trim().min(1).max(200);

export const date = z.string().refine(isDateString, 'Expected a real date as YYYY-MM-DD').describe('A local date, YYYY-MM-DD');
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time as HH:MM').describe('A time of day, HH:MM (24-hour)');

export const id = z.coerce.number().int().positive();

const flag = z.enum(['true', 'false']).transform(value => value === 'true');

// PATCH bodies must change something
const notEmpty = [object => Object.keys(object).length > 0, { message: 'Nothing to update' }];
const partial = shape => z.strictObject(shape).partial().refine(...notEmpty);

// tasks: one list for to-dos and deadlines; a task with a due date is a deadline (DESIGN §3)

export const PRIORITIES = ['high', 'normal', 'low'];
export const EFFORTS = ['quick', 'medium', 'big'];

const task = {
    name: text(200),
    // set to complete it, null to restore it
    done_at: timestamp.nullable(),
    due: date.nullable(),
    priority: z.enum(PRIORITIES),
    effort: z.enum(EFFORTS).nullable(),
    area: optionalText(60),
    notes: optionalText(5000),
    link: optionalText(500),
    source: source.nullable(),
};
export const taskCreate = z.strictObject({
    name: task.name,
    due: task.due.optional(),
    priority: task.priority.default('normal'),
    effort: task.effort.optional(),
    area: task.area,
    notes: task.notes,
    link: task.link,
    source: source.optional(),
});
export const taskUpdate = partial(task);
export const taskQuery = z.strictObject({ done: flag.optional() });

// countdowns

const countdown = {
    label: text(100, 'Label'),
    target_date: date,
    pinned: z.boolean(),
};
export const countdownCreate = z.strictObject({ ...countdown, pinned: countdown.pinned.optional(), source: source.optional() });
export const countdownUpdate = partial(countdown);
export const countdownQuery = z.strictObject({});

// goals

const goal = {
    name: text(100),
    current: z.number().min(0).max(1e9),
    target: z.number().positive().max(1e9),
    unit: optionalText(20),
    archived_at: timestamp.nullable(),
};
export const goalCreate = z.strictObject({ name: goal.name, target: goal.target, current: goal.current.optional(), unit: goal.unit });
export const goalUpdate = partial(goal);
export const goalQuery = z.strictObject({ archived: flag.optional() });
export const goalIncrement = z.strictObject({ by: z.number().min(-1e6).max(1e6).refine(n => n !== 0, 'by cannot be 0').default(1) });

// habits

const habit = {
    name: text(60),
    position: z.number().int().min(0).max(10_000),
    archived_at: timestamp.nullable(),
};
export const habitCreate = z.strictObject({ name: habit.name, position: habit.position.optional() });
export const habitUpdate = partial(habit);
export const habitQuery = z.strictObject({
    days: z.coerce.number().int().min(1).max(366).default(7),
    archived: flag.optional(),
});

// applications

export const STATUSES = ['applied', 'interview', 'offer', 'rejected'];
// applied → interview → offer. Rejected is set only by an edit (DESIGN §10, Job search).
export const NEXT_STATUS = { applied: 'interview', interview: 'offer' };
const application = {
    company: text(100, 'Company'),
    role: text(100, 'Role'),
    status: z.enum(STATUSES),
    applied_on: date,
    url: optionalText(500),
    notes: optionalText(5000),
};
export const applicationCreate = z.strictObject({
    ...application,
    status: application.status.default('applied'),
    // the server fills in today, by its own clock, when it's left out
    applied_on: application.applied_on.optional(),
    source: source.optional(),
});
export const applicationUpdate = partial(application);
export const applicationQuery = z.strictObject({ status: z.enum(STATUSES).optional() });

// settings, night mode, location

export const settingsUpdate = partial({ night_start: time, night_end: time });

export const kioskLocation = z.strictObject({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    name: optionalText(100),
});

export const weatherQuery = z.strictObject({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
}).refine(q => (q.lat === undefined) === (q.lon === undefined), 'Give both lat and lon, or neither');

// a window of dates for events and birthdays, at most a year long
export const dateRange = z.strictObject({ from: date, to: date })
    .refine(({ from, to }) => from <= to, 'from must not be after to')
    .refine(({ from, to }) => !isDateString(from) || !isDateString(to) || daysBetween(from, to) <= 366, 'The range can be at most a year');

export const login = z.strictObject({ token: z.string().min(1).max(512) });

// the change record (DESIGN §5.5)
export const ACTORS = ['owner', 'kiosk', 'claude', 'agent', 'system'];
// where a change by Claude came from: claude.ai, Claude Code, or one claude.ai connection's id
const via = z.union([z.enum(['claude.ai', 'claude-code']), z.coerce.number().int().positive()]);
export const changesQuery = z.strictObject({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    // one actor, or several separated by commas: ?actor=claude,agent
    actor: z.string().transform(value => value.split(',')).pipe(z.array(z.enum(ACTORS)).min(1)).optional(),
    resource: z.enum(['tasks', 'countdowns', 'goals', 'habits', 'habit_checks', 'applications', 'settings']).optional(),
    via: via.optional(),
    since: timestamp.optional(),
});

// Undo everything since a time (docs/CONNECTOR.md §6): Claude's changes by default
export const undoSince = z.strictObject({
    since: timestamp,
    actors: z.array(z.enum(ACTORS)).min(1).default(['claude', 'agent']),
    via: via.optional(),
});

// the claude.ai connectors and their kill switches (docs/CONNECTOR.md §9)
export const CONNECTOR_NAMES = ['chat', 'agent'];
export const connectorName = z.enum(CONNECTOR_NAMES);
export const connectorSwitch = z.strictObject({ enabled: z.boolean() });

// The fields of each resource, for building other schemas from (the MCP tools use them)
export const shapes = { task, countdown, goal, habit, application };
