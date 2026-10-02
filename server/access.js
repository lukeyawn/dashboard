// What a claude.ai connector's token may do (docs/CONNECTOR.md §5). Each
// connector gets an allow-list, never a block-list: a route added later stays
// closed to Claude until someone opens it here on purpose. The owner's and
// the kiosk's tokens aren't limited by this.
import { parseDate, today } from '../shared/dates.js';
import { HttpError } from './errors.js';

const RESOURCES = 'tasks|countdowns|goals|habits|applications';
const end = '/?$';

// [method, path under /api]
export const ALLOWED = {
    // claude.ai chats: read, add and change, but never delete, export, undo,
    // or touch connections, the kill switches or the kiosk's location
    chat: [
        // areas are read-only: Claude chooses from them, and only the owner edits them
        ['GET', new RegExp(`^/(today|${RESOURCES}|areas|events|birthdays|settings|night)${end}`)],
        ['POST', new RegExp(`^/(${RESOURCES})${end}`)],
        ['POST', new RegExp(`^/goals/\\d+/(increment|achieve)${end}`)],
        ['POST', new RegExp(`^/applications/\\d+/advance${end}`)],
        ['POST', new RegExp(`^/night/(start|cancel)${end}`)],
        ['PATCH', new RegExp(`^/(${RESOURCES})/\\d+${end}`)],
        // only the night hours and week_start can be set through it (shared/schemas.js);
        // week_start is harmless, since streaks are worked out on every read
        ['PATCH', new RegExp(`^/settings${end}`)],
        ['PUT', new RegExp(`^/habits/\\d+/checks/[0-9-]+${end}`)],
        // unchecking a day: a quick action, not a deletion of anything
        ['DELETE', new RegExp(`^/habits/\\d+/checks/[0-9-]+${end}`)],
    ],
    // the agent's connector arrives with suggestions (phase 8, PR 3)
    agent: [],
};

export const WRITE_CAP = 100;

export function isAllowed(connector, method, path) {
    return (ALLOWED[connector] ?? []).some(([m, pattern]) => m === method && pattern.test(path));
}

// the start of today in the dashboard's time zone, as a UTC timestamp
export function startOfToday(now) {
    return parseDate(today(new Date(now))).toISOString();
}

export function createAccess({ log, now = Date.now }) {
    // changes made through a connector since midnight, dashboard time
    const writesToday = connector => log.countSince(startOfToday(now()), connector);

    return {
        writesToday,

        // after requireToken: refuses a connector anything off its list, and
        // any write past the daily cap
        check(req, res, next) {
            if (req.client !== 'connector') return next();
            const { connector } = req.connection;
            if (!isAllowed(connector, req.method, req.path)) {
                return next(new HttpError(403, `claude.ai can't use ${req.method} ${req.path}. The owner does that on the dashboard.`));
            }
            if (req.method !== 'GET' && connector === 'chat' && writesToday('chat') >= WRITE_CAP) {
                return next(new HttpError(429, `Today's limit of ${WRITE_CAP} changes through claude.ai is used up. It resets at midnight.`));
            }
            next();
        },
    };
}
