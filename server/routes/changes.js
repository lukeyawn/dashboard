// The change record and undo (DESIGN §5.5)
import express from 'express';
import * as schemas from '../../shared/schemas.js';
import { validate } from '../errors.js';

export function changesRouter(log, undo) {
    const router = express.Router();

    router.get('/', (req, res) => {
        res.json(log.list(validate(schemas.changesQuery, { ...req.query })));
    });

    router.post('/:id/undo', (req, res) => {
        const id = validate(schemas.id, req.params.id);
        res.json({ undone: id, item: undo(id) });
    });

    return router;
}
