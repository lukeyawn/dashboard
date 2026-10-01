import express from 'express';
import * as schemas from '../../shared/schemas.js';
import { HttpError, validate } from '../errors.js';

export function tasksRouter(store) {
    const router = express.Router();

    router.get('/', (req, res) => {
        const { done } = validate(schemas.taskQuery, { ...req.query });
        res.json(store.list({ done }));
    });

    router.post('/', (req, res) => {
        const task = validate(schemas.taskCreate, req.body);
        res.status(201).json(store.create(task));
    });

    router.patch('/:id', (req, res) => {
        const id = validate(schemas.id, req.params.id);
        const changes = validate(schemas.taskUpdate, req.body);
        const task = store.update(id, changes);
        if (!task) throw new HttpError(404, `There's no task ${id}`);
        res.json(task);
    });

    router.delete('/:id', (req, res) => {
        const id = validate(schemas.id, req.params.id);
        if (!store.remove(id)) throw new HttpError(404, `There's no task ${id}`);
        res.status(204).end();
    });

    return router;
}
