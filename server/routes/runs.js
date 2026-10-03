// The scheduled agent's runs (docs/AGENT.md §7): start_run, report_run, and
// the list the dock's timeline reads. Only the agent's connector may start
// and report through claude.ai, and no connector may list them
// (server/access.js).
import express from 'express';
import * as schemas from '../../shared/schemas.js';
import { startOfToday } from '../access.js';
import { HttpError, validate } from '../errors.js';

export function runsRouter(runs, settings, now) {
    const router = express.Router();

    router.get('/', (req, res) => {
        res.json(runs.list(validate(schemas.runsQuery, { ...req.query })));
    });

    // a day's runs through claude.ai are capped by a setting the owner
    // raises when adding agents; the owner's own token isn't limited
    router.post('/', (req, res) => {
        const { name } = validate(schemas.runStart, req.body ?? {});
        const fromConnector = req.client === 'connector';
        const cap = settings.get('agent_runs_per_day');
        if (fromConnector && runs.countSince(startOfToday(now())) >= cap) {
            throw new HttpError(429, `Today's limit of ${cap} agent runs is used up. It resets at midnight, or the owner can raise it on /manage.`);
        }
        res.status(201).json(runs.start({ name, connectionId: fromConnector ? req.connection.id : null }));
    });

    router.post('/:id/report', (req, res) => {
        const id = validate(schemas.id, req.params.id);
        res.json(runs.report(id, validate(schemas.runReport, req.body ?? {})));
    });

    return router;
}
