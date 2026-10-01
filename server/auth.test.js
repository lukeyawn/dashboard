import { describe, expect, it } from 'vitest';
import { checkTokens, createAuth, parseCookies } from './auth.js';
import { API_TOKEN, KIOSK_TOKEN } from './testing.js';

describe('checkTokens', () => {
    it('accepts two different long tokens', () => {
        expect(() => checkTokens({ apiToken: API_TOKEN, kioskToken: KIOSK_TOKEN })).not.toThrow();
    });

    it('rejects missing, short or identical tokens', () => {
        expect(() => checkTokens({ apiToken: undefined, kioskToken: KIOSK_TOKEN })).toThrow('API_TOKEN');
        expect(() => checkTokens({ apiToken: API_TOKEN, kioskToken: 'short' })).toThrow('KIOSK_TOKEN');
        expect(() => checkTokens({ apiToken: API_TOKEN, kioskToken: API_TOKEN })).toThrow('different');
    });
});

describe('parseCookies', () => {
    it('reads and decodes cookies, skipping malformed ones', () => {
        expect(parseCookies('a=1; b=hello%20there; junk; c=%E0%A4%A')).toEqual({ a: '1', b: 'hello there' });
        expect(parseCookies()).toEqual({});
    });
});

describe('identify', () => {
    const auth = createAuth({ apiToken: API_TOKEN, kioskToken: KIOSK_TOKEN });

    it('tells the two tokens apart', () => {
        expect(auth.identify(API_TOKEN)).toBe('api');
        expect(auth.identify(KIOSK_TOKEN)).toBe('kiosk');
    });

    it('rejects anything else', () => {
        for (const token of [API_TOKEN + 'x', API_TOKEN.slice(1), '', null, undefined, 42]) {
            expect(auth.identify(token)).toBeNull();
        }
    });
});
