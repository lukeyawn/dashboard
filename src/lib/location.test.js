import { afterEach, describe, expect, it, vi } from 'vitest';
import { json } from '../testing/fakeApi';
import { reportKioskLocation, resetForTests, roughly } from './location';

afterEach(() => {
    vi.unstubAllGlobals();
    resetForTests();
});

describe('reportKioskLocation', () => {
    it('looks the place up once, and tells the server', async () => {
        const lookup = vi.fn(async () => json(200, { latitude: 30.2672, longitude: -97.7431, city: 'Austin', region_code: 'TX' }));
        const api = vi.fn(async () => json(200, { lat: 30.2672, lon: -97.7431, name: 'Austin, TX' }));
        vi.stubGlobal('fetch', api);
        await reportKioskLocation(lookup);
        expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ lat: 30.2672, lon: -97.7431, name: 'Austin, TX' });
        expect(api.mock.calls[0][0]).toBe('/api/location/kiosk');
        expect(await reportKioskLocation(lookup)).toBeNull();
        expect(lookup).toHaveBeenCalledTimes(1);
    });

    it('sends no name when the lookup has none', async () => {
        const api = vi.fn(async () => json(200, {}));
        vi.stubGlobal('fetch', api);
        await reportKioskLocation(async () => json(200, { latitude: 1, longitude: 2 }));
        expect(JSON.parse(api.mock.calls[0][1].body).name).toBeNull();
    });

    it('fails when the lookup does', async () => {
        await expect(reportKioskLocation(async () => json(429, {}))).rejects.toThrow('429');
    });
});

it('rounds coordinates to about a kilometre', () => {
    expect(roughly(30.26721)).toBe(30.27);
    expect(roughly(-97.74309)).toBe(-97.74);
});
