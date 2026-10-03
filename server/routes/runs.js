// The scheduled agent's runs (docs/AGENT.md §7): report_run, and the list the
// dock's timeline reads. A run opens with its first change (server/access.js)
// or with its report. Only the agent's connector may report through
// claude.ai, and no connector may list runs (server/access.js).
import express from 'express';
import * as schemas from '../../shared/schemas.js';
import { validate } from '../errors.js';

export function runsRouter(runs) {
    const router = express.Router();

    router.get('/', (req, res) => {
        res.json(runs.list(validate(schemas.runsQuery, { ...req.query })));
    });

    router.post('/', (req, res) => {
        const report = validate(schemas.runReport, req.body ?? {});
        res.json(runs.report(report, req.client === 'connector' ? req.connection.id : null));
    });

    return router;
}
