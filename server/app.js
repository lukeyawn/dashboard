// Builds the Express app without listening, so tests can run it on a random
// port with an in-memory database (DESIGN §2).
import path from 'node:path';
import express from 'express';
import * as schemas from '../shared/schemas.js';
import { createAuth } from './auth.js';
import { exportAll } from './backup.js';
import { HttpError, errorHandler, validate } from './errors.js';
import { applicationsRouter, countdownsRouter, deadlinesRouter, goalsRouter, habitsRouter, tasksRouter } from './routes/resources.js';
import { calendarRouters, locationRouter, nightRouter, settingsRouter, weatherRouter } from './routes/system.js';
import { createApplicationStore } from './stores/applications.js';
import { createCountdownStore } from './stores/countdowns.js';
import { createDeadlineStore } from './stores/deadlines.js';
import { createGoalStore } from './stores/goals.js';
import { createHabitStore } from './stores/habits.js';
import { createSettingsStore } from './stores/settings.js';
import { createTaskStore } from './stores/tasks.js';
import { todaySnapshot } from './today.js';

const NO_CALENDAR = { between: () => ({ events: [], birthdays: [] }) };

// calendar: from createCalendarFeed; weatherAt: from createWeather. Tests pass fakes.
export function createApp({ db, apiToken, kioskToken, build = 'dev', distDir = null, now = Date.now, calendar = NO_CALENDAR, weatherAt }) {
    const auth = createAuth({ apiToken, kioskToken, now });
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

    app.use('/api', auth.requireToken);
    const settings = createSettingsStore(db);
    const stores = {
        tasks: createTaskStore(db),
        deadlines: createDeadlineStore(db),
        countdowns: createCountdownStore(db),
        goals: createGoalStore(db),
        habits: createHabitStore(db, { now: () => new Date(now()) }),
        applications: createApplicationStore(db),
    };
    const { events, birthdays } = calendarRouters(calendar);
    app.use('/api/tasks', tasksRouter(stores.tasks));
    app.use('/api/deadlines', deadlinesRouter(stores.deadlines));
    app.use('/api/countdowns', countdownsRouter(stores.countdowns));
    app.use('/api/goals', goalsRouter(stores.goals));
    app.use('/api/habits', habitsRouter(stores.habits));
    app.use('/api/applications', applicationsRouter(stores.applications, now));
    app.use('/api/settings', settingsRouter(settings));
    app.use('/api/night', nightRouter(settings, now));
    app.use('/api/location', locationRouter(settings, now));
    if (weatherAt) app.use('/api/weather', weatherRouter(settings, weatherAt, now));
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
        app.get(['/login', '/manage'], (req, res) => res.sendFile(indexHtml));
    }

    app.use(errorHandler);
    return app;
}
