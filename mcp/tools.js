// The dashboard's tools for a Claude agent (DESIGN §5). Input schemas come from
// shared/schemas.js, the same ones the API validates with.
import { z } from 'zod';
import * as schemas from '../shared/schemas.js';
import { query } from './client.js';

const DATES = 'Dates are local calendar dates as YYYY-MM-DD; times of day are HH:MM; timestamps are UTC ISO-8601.';
const CALENDAR = 'Read-only: events live in Google Calendar. To add or change one, use the Google Calendar connector instead.';

const id = z.number().int().positive().describe('The item id, from a list_ tool');

// every field of a resource made optional, plus the id: the input for update_ tools
function updateInput(shape) {
    return { id, ...Object.fromEntries(Object.entries(shape).map(([key, field]) => [key, field.optional()])) };
}

function result(value) {
    return { content: [{ type: 'text', text: JSON.stringify(value ?? { ok: true }, null, 2) }] };
}

function failure(err) {
    const details = (err.details ?? []).map(d => `- ${d.path ? `${d.path}: ` : ''}${d.message}`).join('\n');
    return { isError: true, content: [{ type: 'text', text: details ? `${err.message}\n${details}` : err.message }] };
}

// kind: 'read' (safe to call any time), 'write', or 'delete'
export function registerTools(server, call, now = () => new Date()) {
    function tool(name, kind, description, input, run) {
        server.registerTool(name, {
            description: `${description} ${DATES}`,
            inputSchema: input,
            annotations: {
                readOnlyHint: kind === 'read',
                destructiveHint: kind === 'delete',
                openWorldHint: false,
            },
        }, async args => {
            try {
                return result(await run(args));
            } catch (err) {
                return failure(err);
            }
        });
    }

    const crud = (resource, singular, plural, { listInput = {}, listQuery = args => args, createInput, notes = '' }) => {
        tool(`list_${plural}`, 'read', `List ${plural}.${notes}`, listInput, args => call('GET', `/${resource}${query(listQuery(args))}`));
        tool(`add_${singular}`, 'write', `Add a ${singular}.${notes}`, createInput, args => call('POST', `/${resource}`, args));
        tool(`update_${singular}`, 'write', `Change some fields of a ${singular}; leave out the fields that stay the same.${notes}`,
            updateInput(schemas.shapes[singular]), ({ id: itemId, ...changes }) => call('PATCH', `/${resource}/${itemId}`, changes));
    };

    tool('get_today', 'read',
        "A snapshot of today: today's events, birthdays this week, open tasks, deadlines due within 14 days (with overdue ones), goals, habits and whether each is done today, the nearest countdowns, application counts, the weather and night mode. Start here.",
        {}, () => call('GET', '/today'));

    crud('tasks', 'task', 'tasks', {
        listInput: { done: z.boolean().optional().describe('false for open tasks only, true for completed ones') },
        createInput: { name: schemas.shapes.task.name },
        notes: ' Tasks are ongoing, not tied to a day.',
    });
    tool('complete_task', 'write', 'Mark a task done. It can be restored with update_task and done_at: null.', { id },
        ({ id: taskId }) => call('PATCH', `/tasks/${taskId}`, { done_at: now().toISOString() }));

    crud('deadlines', 'deadline', 'deadlines', {
        listInput: { done: z.boolean().optional().describe('false for open deadlines only') },
        createInput: { name: schemas.shapes.deadline.name, due: schemas.shapes.deadline.due, course: schemas.shapes.deadline.course },
        notes: ' A deadline has a due date and an optional course; overdue ones stay until completed.',
    });
    tool('complete_deadline', 'write', 'Mark a deadline done.', { id },
        ({ id: deadlineId }) => call('PATCH', `/deadlines/${deadlineId}`, { done_at: now().toISOString() }));

    crud('countdowns', 'countdown', 'countdowns', {
        createInput: { label: schemas.shapes.countdown.label, target_date: schemas.shapes.countdown.target_date, pinned: schemas.shapes.countdown.pinned.optional() },
        notes: ' One-off dates such as finals or a break. At most one is pinned; pinning one unpins the rest. Birthdays are not countdowns: they are yearly all-day events in Google Calendar.',
    });

    crud('goals', 'goal', 'goals', {
        listInput: { archived: z.boolean().optional().describe('false for active goals only') },
        createInput: { name: schemas.shapes.goal.name, target: schemas.shapes.goal.target, current: schemas.shapes.goal.current.optional(), unit: schemas.shapes.goal.unit },
        notes: ' Archive a finished goal by setting archived_at to the current time.',
    });
    tool('increment_goal', 'write', 'Add progress to a goal. A negative amount undoes progress; it never goes below 0.',
        { id, by: z.number().refine(n => n !== 0, 'by cannot be 0').optional().describe('How much to add; 1 if left out') },
        ({ id: goalId, by }) => call('POST', `/goals/${goalId}/increment`, by === undefined ? {} : { by }));

    crud('habits', 'habit', 'habits', {
        listInput: { days: z.number().int().min(1).max(366).optional().describe('How many recent days of checks to include; 7 if left out') },
        listQuery: ({ days }) => ({ days }),
        createInput: { name: schemas.shapes.habit.name, position: schemas.shapes.habit.position.optional() },
        notes: ' Habits are daily. Archive one by setting archived_at to the current time.',
    });
    tool('check_habit', 'write', 'Mark a habit done or not done on a day. Both are idempotent. A future day cannot be marked done.',
        { habit_id: id, date: schemas.date, done: z.boolean() },
        ({ habit_id: habitId, date, done }) => call(done ? 'PUT' : 'DELETE', `/habits/${habitId}/checks/${date}`));

    crud('applications', 'application', 'applications', {
        listInput: { status: z.enum(schemas.STATUSES).optional() },
        createInput: {
            company: schemas.shapes.application.company,
            role: schemas.shapes.application.role,
            status: schemas.shapes.application.status.optional(),
            applied_on: schemas.shapes.application.applied_on.optional().describe('Today if left out'),
            url: schemas.shapes.application.url,
            notes: schemas.shapes.application.notes,
        },
        notes: ' Internship applications; status is applied, interview, offer or rejected.',
    });
    tool('set_application_status', 'write', 'Set an application\'s status, including rejected.',
        { id, status: z.enum(schemas.STATUSES) },
        ({ id: appId, status }) => call('PATCH', `/applications/${appId}`, { status }));

    tool('list_events', 'read', `Event occurrences between two dates, with repeating events expanded. ${CALENDAR}`,
        { from: schemas.date, to: schemas.date }, args => call('GET', `/events${query(args)}`));
    tool('list_birthdays', 'read', `Birthdays between two dates: yearly all-day events in Google Calendar. ${CALENDAR} A birthday is created as an all-day event repeating yearly.`,
        { from: schemas.date, to: schemas.date }, args => call('GET', `/birthdays${query(args)}`));

    tool('get_settings', 'read', 'The user\'s settings: night_start and night_end, the night-mode hours.', {}, () => call('GET', '/settings'));
    tool('update_settings', 'write', 'Change the night-mode hours. Hours wrap past midnight when the start is later than the end.',
        { night_start: schemas.time.optional(), night_end: schemas.time.optional() }, args => call('PATCH', '/settings', args));
    tool('start_night', 'write', 'Turn on night mode now, on the kiosk too, until the next night_end.', {}, () => call('POST', '/night/start'));
    tool('cancel_night', 'write', 'Cancel an early start of night mode.', {}, () => call('POST', '/night/cancel'));

    tool('delete_item', 'delete',
        'Permanently delete an item. Always confirm with the user before calling this. Prefer complete_task, complete_deadline or archiving (archived_at) when the user only means "done" or "no longer active".',
        { resource: z.enum(['tasks', 'deadlines', 'countdowns', 'goals', 'habits', 'applications']), id },
        ({ resource, id: itemId }) => call('DELETE', `/${resource}/${itemId}`));
}
