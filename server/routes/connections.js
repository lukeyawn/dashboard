// The claude.ai connectors on /manage (docs/CONNECTOR.md §9): their switches,
// their connections with Revoke, and today's write count. Tailnet-only, and
// closed to the connectors themselves by their allow-lists (server/access.js).
import express from 'express';
import * as schemas from '../../shared/schemas.js';
import { WRITE_CAPS } from '../access.js';
import { HttpError, validate } from '../errors.js';
import { END_REASONS } from '../stores/connections.js';

export const switchKey = connector => `connector_${connector}_enabled`;

// connections, oauth: null when the connector isn't set up (no PUBLIC_URL)
export function connectionsRouter({ connections, oauth, settings, access }) {
    const router = express.Router();
    const isOn = connector => settings.get(switchKey(connector)) !== false;
    const describe = connector => ({
        name: connector,
        configured: Boolean(oauth?.connectors().includes(connector)),
        enabled: isOn(connector),
        url: oauth ? oauth.resourceOf(connector) : null,
        writes_today: access.writesToday(connector),
        write_cap: WRITE_CAPS[connector],
    });

    router.get('/connectors', (req, res) => res.json(schemas.CONNECTOR_NAMES.map(describe)));

    // the kill switch: off revokes every connection of that connector at once
    // and refuses new sign-ins; Claude's changes stay for review
    router.put('/connectors/:name', (req, res) => {
        const name = validate(schemas.connectorName, req.params.name);
        const { enabled } = validate(schemas.connectorSwitch, req.body);
        settings.set(switchKey(name), enabled);
        if (!enabled) {
            connections?.revokeAll(name);
            oauth?.forgetPending(name);
        }
        res.json(describe(name));
    });

    router.get('/connections', (req, res) => {
        res.json((connections?.list() ?? []).map(c => ({ ...c, end_reason_text: END_REASONS[c.end_reason] ?? null })));
    });

    router.post('/connections/:id/revoke', (req, res) => {
        const id = validate(schemas.id, req.params.id);
        if (!connections?.revoke(id)) throw new HttpError(404, `There's no live connection ${id}`);
        res.status(204).end();
    });

    return router;
}
