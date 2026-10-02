// Request schemas shared by the API, the frontend and the MCP server, so every
// way of putting data in goes through the same validation (DESIGN §4, §5).
import { z } from 'zod';
import { DETAILS } from './countdowns.js';
import { UNITS } from './repeat.js';
import { WEEK_STARTS, daysBetween, isDateString } from './dates.js';

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

// when you intend to do it (docs/BLOCKS.md §3)
export const PRIORITIES = ['now', 'soon', 'someday'];

// a recurrence rule (shared/repeat.js); a recurring task needs a due date
export const repeatRule = z.strictObject({
    every: z.number().int().min(1).max(365),
    unit: z.enum(UNITS),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    day_of_month: z.number().int().min(1).max(31).optional(),
})
    .refine(r => !r.weekdays || r.unit === 'week', { message: 'weekdays are only for weekly rules', path: ['weekdays'] })
    .refine(r => !r.weekdays || new Set(r.weekdays).size === r.weekdays.length, { message: 'A weekday is listed twice', path: ['weekdays'] })
    .refine(r => !r.day_of_month || r.unit === 'month', { message: 'day_of_month is only for monthly rules', path: ['day_of_month'] });

const task = {
    name: text(200),
    // set to complete it, null to restore it; a recurring task moves to its next due date instead
    done_at: timestamp.nullable(),
    due: date.nullable(),
    priority: z.enum(PRIORITIES),
    // one of the areas (GET /api/areas)
    area_id: z.number().int().positive().nullable(),
    // an estimate, in minutes
    minutes: z.number().int().min(1, 'At least a minute').max(10_000).nullable(),
    notes: optionalText(5000),
    link: optionalText(500),
    source: source.nullable(),
    repeat: repeatRule.nullable(),
};
const needsDue = [t => !t.repeat || t.due, { message: 'A recurring task needs a due date', path: ['due'] }];
export const taskCreate = z.strictObject({
    name: task.name,
    due: task.due.optional(),
    priority: task.priority.default('soon'),
    area_id: task.area_id.optional(),
    minutes: task.minutes.optional(),
    notes: task.notes,
    link: task.link,
    source: source.optional(),
    repeat: task.repeat.optional(),
}).refine(...needsDue);
export const taskUpdate = partial(task);

// areas: a list the owner edits; Claude only chooses from it (docs/BLOCKS.md §3)
const area = {
    name: text(40),
    // the area's place in the list, from 0; moving one shifts the rest
    position: z.number().int().min(0).max(1000),
};
export const areaCreate = z.strictObject({ name: area.name });
export const areaUpdate = partial(area);
export const areaQuery = z.strictObject({});
export const taskQuery = z.strictObject({ done: flag.optional() });

// countdowns: past dates are refused by the server, which knows the time
// (shared/countdowns.js); hours and live need a time (docs/BLOCKS.md §4)

const countdown = {
    label: text(100, 'Label'),
    target_date: date,
    // local; without one, a countdown counts to the start of its day
    target_time: time.nullable(),
    detail: z.enum(DETAILS),
    pinned: z.boolean(),
};
export const countdownCreate = z.strictObject({
    ...countdown,
    target_time: countdown.target_time.optional(),
    detail: countdown.detail.optional(),
    pinned: countdown.pinned.optional(),
    source: source.optional(),
}).refine(c => !c.detail || c.detail === 'days' || c.target_time, { message: 'Hours and live need a time.', path: ['detail'] });
export const countdownUpdate = partial(countdown);
// the current countdowns by default; past=true for the ones whose day has gone
export const countdownQuery = z.strictObject({ past: flag.optional() });

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
    // days a week the habit is meant for; 7 is daily (docs/BLOCKS.md §2)
    per_week: z.number().int().min(1, 'At least once a week').max(7, 'At most 7 times a week'),
    archived_at: timestamp.nullable(),
};
export const habitCreate = z.strictObject({ name: habit.name, position: habit.position.optional(), per_week: habit.per_week.optional() });
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

// the night hours, the day weeks start on (for habits), and the area
// the Assignments tile shows (an area id)
export const settingsUpdate = partial({ night_start: time, night_end: time, week_start: z.enum(WEEK_STARTS), assignments_area: z.number().int().positive() });

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
    resource: z.enum(['tasks', 'areas', 'countdowns', 'goals', 'habits', 'habit_checks', 'applications', 'settings']).optional(),
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
export const shapes = { task, area, countdown, goal, habit, application };
