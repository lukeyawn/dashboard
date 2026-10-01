// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetForTests } from '../lib/location';
import { fakeServer, json } from '../testing/fakeApi';
import { useWeather } from './useWeather';

const WEATHER = { location: { source: 'default' }, temperature: 82, report_location: false };

afterEach(() => {
    vi.unstubAllGlobals();
    resetForTests();
});

function geolocation(position) {
    vi.stubGlobal('navigator', {
        ...navigator,
        geolocation: {
            getCurrentPosition: (ok, fail) => (position ? ok({ coords: position }) : fail(new Error('denied'))),
        },
    });
}

describe('useWeather', () => {
    it("asks for this device's rounded location when the browser shares it", async () => {
        geolocation({ latitude: 40.71281, longitude: -74.00602 });
        const api = fakeServer({ 'GET /api/weather': () => WEATHER });
        api.install();
        renderHook(() => useWeather());
        await waitFor(() => expect(api.requests.map(r => r.url)).toContain('/api/weather?lat=40.71&lon=-74.01'));
    });

    it('lets the server pick when the browser refuses', async () => {
        geolocation(null);
        const api = fakeServer({ 'GET /api/weather': () => WEATHER });
        api.install();
        const { result } = renderHook(() => useWeather());
        await waitFor(() => expect(result.current.data).toEqual(WEATHER));
        expect(api.requests.map(r => r.url)).toEqual(['/api/weather']);
    });

    it('reports the kiosk location when the server asks, then refetches', async () => {
        geolocation(null);
        let reported = false;
        const api = fakeServer({
            'GET /api/weather': () => ({ ...WEATHER, report_location: !reported }),
            'PUT /api/location/kiosk': ({ body }) => {
                reported = true;
                return body;
            },
        });
        api.install();
        const realFetch = fetch;
        vi.stubGlobal('fetch', vi.fn((url, init) => (url.startsWith('https://ipapi.co')
            ? Promise.resolve(json(200, { latitude: 30.27, longitude: -97.74, city: 'Austin', region_code: 'TX' }))
            : realFetch(url, init))));
        const { result } = renderHook(() => useWeather());
        await waitFor(() => expect(result.current.data?.report_location).toBe(false));
        expect(api.writes()).toEqual([{ method: 'PUT', url: '/api/location/kiosk', body: { lat: 30.27, lon: -97.74, name: 'Austin, TX' } }]);
    });
});
