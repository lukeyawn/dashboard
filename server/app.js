// Builds the Express app without listening, so tests can run it on a random
// port with an in-memory database (DESIGN §2).
import path from 'node:path';
import express from 'express';
import * as schemas from '../shared/schemas.js';
import { createAuth } from './auth.js';
import { HttpError, errorHandler, validate } from './errors.js';
import { tasksRouter } from './routes/tasks.js';
import { createTaskStore } from './stores/tasks.js';

export function createApp({ db, apiToken, kioskToken, build = 'dev', distDir = null, now = Date.now }) {
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
    app.use('/api/tasks', tasksRouter(createTaskStore(db)));
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
