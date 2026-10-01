// Text written through a claude.ai connector is cleaned before it's stored
// (docs/CONNECTOR.md \u00A77). An email can carry characters that make text look
// like something else; none of them survive. Links must be https.
import { HttpError } from './errors.js';

// C0 and C1 control characters, except the newline
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
// zero-width characters, and the marks and overrides that reorder text
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u061C\uFEFF]/g;

// fields whose newlines are kept; everywhere else a newline becomes a space
const MULTILINE = new Set(['notes']);
// fields that hold a link
const LINKS = new Set(['link', 'url']);
export const MAX_LINK = 500;

export function cleanText(text, { multiline = false } = {}) {
    let out = text.normalize('NFC').replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(INVISIBLE, '');
    if (!multiline) out = out.replace(/\n+/g, ' ');
    return out.trim();
}

// A link from a connector: https only, and short. Empty clears the field.
export function checkLink(field, value) {
    if (value === '') return;
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new HttpError(400, `${field} must be a full https:// link`);
    }
    if (url.protocol !== 'https:') throw new HttpError(400, `${field} must be an https:// link`);
    if (value.length > MAX_LINK) throw new HttpError(400, `${field} is too long`);
}

// Cleans every string in a JSON body, in place of the original
export function cleanBody(body) {
    if (typeof body === 'string') return cleanText(body);
    if (Array.isArray(body)) return body.map(cleanBody);
    if (!body || typeof body !== 'object') return body;
    const out = {};
    for (const [key, value] of Object.entries(body)) {
        out[key] = typeof value === 'string' ? cleanText(value, { multiline: MULTILINE.has(key) }) : cleanBody(value);
        if (LINKS.has(key) && typeof out[key] === 'string') checkLink(key, out[key]);
    }
    return out;
}

// Express middleware: only requests from a connector are cleaned
export function cleanConnectorWrites(req, res, next) {
    if (req.client === 'connector' && req.body && typeof req.body === 'object') req.body = cleanBody(req.body);
    next();
}
