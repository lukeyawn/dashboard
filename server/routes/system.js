// Settings, night mode, weather and calendar routes.
import express from 'express';
import * as schemas from '../../shared/schemas.js';
import { HttpError, validate } from '../errors.js';
import { nextEnd, nightState } from '../night.js';
import { KIOSK_REPORT_EVERY_MS, chooseLocation } from '../weather.js';

export function settingsRouter(settings) {
    const router = express.Router();
    router.get('/', (req, res) => res.json(settings.user()));
    router.patch('/', (req, res) => {
        // only the owner's screens say they've looked at the agent's changes,
        // so a connector can't hide them (docs/AGENT.md §3)
        if (req.client === 'connector' && req.body && Object.hasOwn(req.body, 'agent_seen_at')) {
            throw new HttpError(403, "claude.ai can't set agent_seen_at. The owner does that on the dashboard.");
        }
        res.json(settings.updateUser(validate(schemas.settingsUpdate, req.body)));
    });
    return router;
}

export function nightRouter(settings, now) {
    const router = express.Router();
    const state = () => nightState(new Date(now()), {
        night_start: settings.get('night_start'),
        night_end: settings.get('night_end'),
        night_early_until: settings.get('night_early_until'),
    });
    router.get('/', (req, res) => res.json(state()));
    // start night mode now, until the next night_end (DESIGN §6.4)
    router.post('/start', (req, res) => {
        settings.set('night_early_until', nextEnd(new Date(now()), settings.get('night_end')).toISOString());
        res.json(state());
    });
    router.post('/cancel', (req, res) => {
        settings.clear('night_early_until');
        res.json(state());
    });
    return router;
}

export function weatherRouter(settings, weatherAt, now) {
    const router = express.Router();

    router.get('/', async (req, res) => {
        const { lat, lon } = validate(schemas.weatherQuery, { ...req.query });
        const kiosk = settings.get('kiosk_location');
        const location = chooseLocation(lat === undefined ? null : { lat, lon }, kiosk);
        let weather;
        try {
            weather = await weatherAt(location);
        } catch (err) {
            throw new HttpError(502, `Couldn't get the weather: ${err.message}`);
        }
        // only the kiosk is asked to look up where it is, at most about once a day
        const reportedAt = kiosk?.reported_at ? Date.parse(kiosk.reported_at) : 0;
        const reportLocation = req.client === 'kiosk' && now() - reportedAt > KIOSK_REPORT_EVERY_MS;
        res.json({ location, ...weather, report_location: reportLocation });
    });

    return router;
}

export function locationRouter(settings, now) {
    const router = express.Router();
    router.put('/kiosk', (req, res) => {
        if (req.client !== 'kiosk') throw new HttpError(403, 'Only the kiosk reports its location');
        const { lat, lon, name } = validate(schemas.kioskLocation, req.body);
        const location = { lat, lon, name: name ?? null, reported_at: new Date(now()).toISOString() };
        settings.set('kiosk_location', location);
        res.json(location);
    });
    return router;
}

export function calendarRouters(feed) {
    const events = express.Router();
    events.get('/', (req, res) => {
        const { from, to } = validate(schemas.dateRange, { ...req.query });
        res.json(feed.between(from, to).events);
    });
    const birthdays = express.Router();
    birthdays.get('/', (req, res) => {
        const { from, to } = validate(schemas.dateRange, { ...req.query });
        res.json(feed.between(from, to).birthdays);
    });
    return { events, birthdays };
}
