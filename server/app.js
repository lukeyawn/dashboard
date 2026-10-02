// Builds the Express app without listening, so tests can run it on a random
// port with an in-memory database (DESIGN §2).
import path from 'node:path';
import express from 'express';
import * as schemas from '../shared/schemas.js';
import { WRITE_CAP, createAccess } from './access.js';
import { createAuth } from './auth.js';
import { exportAll } from './backup.js';
import { systemStatus } from './status.js';
import { HttpError, errorHandler, validate } from './errors.js';
import { actorOf, connectionOf, createChangeLog, withActor } from './changes.js';
import { cleanConnectorWrites } from './clean.js';
import { createMcpHandler } from './mcp.js';
import { createOAuth } from './oauth.js';
import { createPublicApp } from './public.js';
import { changesRouter } from './routes/changes.js';
import { connectionsRouter, switchKey } from './routes/connections.js';
import { applicationsRouter, countdownsRouter, goalsRouter, habitsRouter, tasksRouter } from './routes/resources.js';
import { calendarRouters, locationRouter, nightRouter, settingsRouter, weatherRouter } from './routes/system.js';
import { createApplicationStore } from './stores/applications.js';
import { createConnectionStore } from './stores/connections.js';
import { createCountdownStore } from './stores/countdowns.js';
import { createGoalStore } from './stores/goals.js';
import { createHabitStore } from './stores/habits.js';
import { createSettingsStore } from './stores/settings.js';
import { createTaskStore } from './stores/tasks.js';
import { todaySnapshot } from './today.js';
import { createUndo } from './undo.js';

const NO_CALENDAR = { between: () => ({ events: [], birthdays: [] }) };

// calendar: from createCalendarFeed; weatherAt: from createWeather. Tests pass fakes.
// backupStatusFile: where vm/backup.sh records its last run (DESIGN §5.5)
// connector: the claude.ai connectors (docs/CONNECTOR.md), or null when they
//   aren't set up: { publicUrl, tailnetUrl, clients, refreshKey, apiUrl }.
//   With it, app.locals.publicApp is the public listener's app, for index.js
//   to listen with on its own port.
export function createApp({ db, apiToken, kioskToken, build = 'dev', distDir = null, now = Date.now, calendar = NO_CALENDAR, weatherAt, backupStatusFile = null, connector = null }) {
    const connections = connector ? createConnectionStore(db, { refreshKey: connector.refreshKey, now }) : null;
    const auth = createAuth({ apiToken, kioskToken, now, connections });
    const app = express();
    app.disable('x-powered-by');

    // the page compares this with its own build to notice a deploy (DESIGN §6.4)
    app.use((req, res, next) => {
        res.set('X-Build', build);
        next();
    });

    // Polls revalidate every time; Express's ETag turns an unchanged answer
    // into an empty 304 (DESIGN §4)
    app.use('/api', (req, res, next) => {
        res.set('Cache-Control', 'no-cache, private');
        next();
    });
    app.use('/api', express.json({ limit: '100kb' }));

    // the only routes without a token
    app.get('/api/health', (req, res) => res.status(200).end());

    app.post('/api/login', (req, res) => {
        const { token } = validate(schemas.login, req.body);
        auth.logIn(token, res);
        res.status(204).end();
    });

    // the kiosk's login link: sets the cookie, then drops the token from the address bar
    app.get('/login', (req, res, next) => {
        const token = req.query.token;
        if (typeof token !== 'string') return next();
        try {
            auth.logIn(token, res);
            res.redirect(303, '/');
        } catch (err) {
            res.redirect(303, `/login?failed=${err.status}`);
        }
    });

    const log = createChangeLog(db, { now });
    const access = createAccess({ log, now });
    app.use('/api', auth.requireToken);
    // a claude.ai connector may use only the routes on its allow-list, and
    // what it writes is cleaned first (docs/CONNECTOR.md §5, §7)
    app.use('/api', access.check);
    app.use('/api', cleanConnectorWrites);
    // every write made while handling this request is recorded as this actor,
    // and the claude.ai connection if there is one (DESIGN §5.5)
    app.use('/api', (req, res, next) => withActor(actorOf(req), next, connectionOf(req)));
    // which token this browser logged in with; the kiosk behaves as a kiosk (DESIGN §6.4)
    app.get('/api/session', (req, res) => res.json({ client: req.client }));
    const settings = createSettingsStore(db, { log });
    const oauth = connector && createOAuth({
        connections,
        publicUrl: connector.publicUrl,
        tailnetUrl: connector.tailnetUrl,
        clients: connector.clients,
        isEnabled: name => settings.get(switchKey(name)) !== false,
        now,
    });
    const stores = {
        tasks: createTaskStore(db, { log }),
        countdowns: createCountdownStore(db, { log, now: () => new Date(now()) }),
        goals: createGoalStore(db, { log }),
        habits: createHabitStore(db, { now: () => new Date(now()), log, weekStart: () => settings.get('week_start') }),
        applications: createApplicationStore(db, { log }),
    };
    const { events, birthdays } = calendarRouters(calendar);
    app.use('/api/tasks', tasksRouter(stores.tasks));
    app.use('/api/countdowns', countdownsRouter(stores.countdowns));
    app.use('/api/goals', goalsRouter(stores.goals));
    app.use('/api/habits', habitsRouter(stores.habits));
    app.use('/api/applications', applicationsRouter(stores.applications, now));
    app.use('/api/settings', settingsRouter(settings));
    app.use('/api/changes', changesRouter(log, createUndo(db, log)));
    if (oauth) app.use('/api/connect', oauth.approvalRouter());
    app.use('/api', connectionsRouter({ connections, oauth, settings, access }));
    app.use('/api/night', nightRouter(settings, now));
    app.use('/api/location', locationRouter(settings, now));
    if (weatherAt) app.use('/api/weather', weatherRouter(settings, weatherAt, now));
    app.get('/api/status', (req, res) => {
        const connectors = () => (oauth?.connectors() ?? []).map(name => ({
            name,
            lost: Boolean(connections.lost(name)),
            capped: name === 'chat' && access.writesToday('chat') >= WRITE_CAP,
        }));
        res.json(systemStatus({ backupStatusFile, calendar, now: now(), connectors }));
    });
    app.get('/api/today', async (req, res) => {
        res.json(await todaySnapshot({ stores, settings, calendar, weatherAt, now: new Date(now()) }));
    });
    app.use('/api/events', events);
    // every table as one JSON document (DESIGN §2)
    app.get('/api/export', (req, res) => {
        res.set('Content-Disposition', `attachment; filename="dashboard-export-${new Date(now()).toISOString().slice(0, 10)}.json"`);
        res.json(exportAll(db, new Date(now())));
    });
    app.use('/api/birthdays', birthdays);
    app.use('/api', (req) => {
        throw new HttpError(404, `There's no API route ${req.method} ${req.path}`);
    });

    if (distDir) {
        // hashed bundles never change, so browsers can keep them
        app.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y' }));
        app.use(express.static(distDir));
        // the frontend picks the page from the address (DESIGN §2)
        const indexHtml = path.resolve(distDir, 'index.html');
        app.get(['/login', '/manage', '/connect/:id'], (req, res) => res.sendFile(indexHtml));
    }

    app.use(errorHandler);

    if (oauth) {
        app.locals.publicApp = createPublicApp({
            oauth,
            connections,
            handleMcp: createMcpHandler({ apiUrl: connector.apiUrl, now: () => new Date(now()) }),
            publicUrl: connector.publicUrl,
            now,
            log: connector.log,
        });
    }
    return app;
}
