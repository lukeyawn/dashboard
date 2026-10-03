// The change record and undo (DESIGN §5.5)
import express from 'express';
import * as schemas from '../../shared/schemas.js';
import { validate } from '../errors.js';

export function changesRouter(log, undo) {
    const router = express.Router();

    router.get('/', (req, res) => {
        res.json(log.list(validate(schemas.changesQuery, { ...req.query })));
    });

    // undo Claude's changes since a time, newest first; the UI sends via:
    // 'claude.ai' unless the owner widens it (docs/CONNECTOR.md §6). With
    // run, one of the agent's runs (docs/AGENT.md §7).
    router.post('/undo-since', (req, res) => {
        res.json(undo.since(validate(schemas.undoSince, req.body ?? {})));
    });

    router.post('/:id/undo', (req, res) => {
        const id = validate(schemas.id, req.params.id);
        res.json({ undone: id, item: undo(id) });
    });

    return router;
}
