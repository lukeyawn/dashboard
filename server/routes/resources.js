// Routes for every stored resource: the generic four (DESIGN §4) plus each one's quick actions.
import { today } from '../../shared/dates.js';
import * as schemas from '../../shared/schemas.js';
import { crudRouter } from '../crud.js';
import { HttpError, validate } from '../errors.js';

export function tasksRouter(store) {
    return crudRouter(store, { noun: 'task', create: schemas.taskCreate, update: schemas.taskUpdate, query: schemas.taskQuery });
}

// the task areas (docs/BLOCKS.md §3); adding a name that exists, ignoring case, returns that area
export function areasRouter(store) {
    return crudRouter(store, { noun: 'area', create: schemas.areaCreate, update: schemas.areaUpdate, query: schemas.areaQuery });
}

export function countdownsRouter(store) {
    return crudRouter(store, { noun: 'countdown', create: schemas.countdownCreate, update: schemas.countdownUpdate, query: schemas.countdownQuery });
}

export function goalsRouter(store) {
    return crudRouter(store, {
        noun: 'goal',
        create: schemas.goalCreate,
        update: schemas.goalUpdate,
        query: schemas.goalQuery,
        extend(router, { idParam, notFound }) {
            router.post('/:id/increment', (req, res) => {
                const id = idParam(req);
                const { by } = validate(schemas.goalIncrement, req.body ?? {});
                const goal = store.increment(id, by);
                if (!goal) throw notFound(id);
                res.json(goal);
            });
            // Done, for a milestone: achieved and archived
            router.post('/:id/achieve', (req, res) => {
                const id = idParam(req);
                const goal = store.achieve(id);
                if (!goal) throw notFound(id);
                res.json(goal);
            });
        },
    });
}

export function habitsRouter(store) {
    const router = crudRouter(store, {
        noun: 'habit',
        create: schemas.habitCreate,
        update: schemas.habitUpdate,
        query: schemas.habitQuery,
        extend(router, { idParam, notFound }) {
            // mark a day done or not done; both idempotent, and never in the future
            const setCheck = done => (req, res) => {
                const id = idParam(req);
                const date = validate(schemas.date, req.params.date);
                if (done && date > store.today()) throw new HttpError(400, "A habit can't be done on a future day");
                const { days } = validate(schemas.habitQuery, { ...req.query });
                const habit = store.setCheck(id, date, done, days);
                if (!habit) throw notFound(id);
                res.json(habit);
            };
            router.put('/:id/checks/:date', setCheck(true));
            router.delete('/:id/checks/:date', setCheck(false));
        },
    });
    return router;
}

export function applicationsRouter(store, now = Date.now) {
    return crudRouter(store, {
        noun: 'application',
        // applied today, in the dashboard's time zone
        defaults: () => ({ applied_on: today(new Date(now())) }),
        create: schemas.applicationCreate,
        update: schemas.applicationUpdate,
        query: schemas.applicationQuery,
        extend(router, { idParam, notFound }) {
            router.post('/:id/advance', (req, res) => {
                const id = idParam(req);
                const application = store.advance(id);
                if (application === null) throw notFound(id);
                if (application === undefined) {
                    throw new HttpError(409, 'Only applied and interview applications can advance');
                }
                res.json(application);
            });
        },
    });
}
