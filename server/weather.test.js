import { describe, expect, it, vi } from 'vitest';
import { AUSTIN, chooseLocation, conditionOf, createWeather, forecastUrl } from './weather.js';

const FORECAST = {
    current: { temperature_2m: 81.6, weather_code: 2 },
    daily: { temperature_2m_max: [92.2], temperature_2m_min: [70.4] },
};

function fakeFetch(...responses) {
    return vi.fn(async () => {
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return new Response(JSON.stringify(next ?? FORECAST), { status: next?.status ?? 200 });
    });
}

describe('chooseLocation', () => {
    it("prefers the device's own location, then the kiosk's, then Austin", () => {
        const kiosk = { lat: 47.6, lon: -122.3, name: 'Seattle, WA' };
        expect(chooseLocation({ lat: 1, lon: 2 }, kiosk)).toEqual({ lat: 1, lon: 2, name: null, source: 'device' });
        expect(chooseLocation(null, kiosk)).toEqual({ ...kiosk, source: 'kiosk' });
        expect(chooseLocation(null, { lat: 1, lon: 2 })).toMatchObject({ name: null, source: 'kiosk' });
        expect(chooseLocation(null, null)).toEqual({ ...AUSTIN, source: 'default' });
    });
});

describe('conditionOf', () => {
    it('names WMO codes', () => {
        expect(conditionOf(0)).toBe('Clear');
        expect(conditionOf(63)).toBe('Rain');
        expect(conditionOf(95)).toBe('Thunderstorms');
        expect(conditionOf(1234)).toBe('Unknown');
    });
});

describe('forecastUrl', () => {
    it('asks Open-Meteo for Fahrenheit in local time', () => {
        const url = new URL(forecastUrl({ lat: 30.27, lon: -97.74 }));
        expect(url.hostname).toBe('api.open-meteo.com');
        expect(url.searchParams.get('latitude')).toBe('30.270');
        expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit');
        expect(url.searchParams.get('timezone')).toBe('auto');
    });
});

describe('createWeather', () => {
    it('rounds the forecast and names the condition', async () => {
        const weatherAt = createWeather({ fetch: fakeFetch(), now: () => 0 });
        expect(await weatherAt(AUSTIN)).toEqual({
            temperature: 82, condition: 'Partly cloudy', high: 92, low: 70, unit: 'F', fetched_at: new Date(0).toISOString(),
        });
    });

    it('fetches each place at most once per 30 minutes', async () => {
        let time = 0;
        const fetch = fakeFetch();
        const weatherAt = createWeather({ fetch, now: () => time });
        await weatherAt(AUSTIN);
        await weatherAt({ lat: 30.271, lon: -97.741 });
        expect(fetch).toHaveBeenCalledTimes(1);
        time += 30 * 60 * 1000;
        await weatherAt(AUSTIN);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('falls back to the last answer when a refresh fails', async () => {
        let time = 0;
        const weatherAt = createWeather({ fetch: fakeFetch(FORECAST, new Error('offline')), now: () => time });
        const first = await weatherAt(AUSTIN);
        time += 60 * 60 * 1000;
        expect(await weatherAt(AUSTIN)).toEqual(first);
    });

    it('fails when there is nothing to fall back on', async () => {
        const weatherAt = createWeather({ fetch: fakeFetch({ status: 503 }) });
        await expect(weatherAt(AUSTIN)).rejects.toThrow('Open-Meteo answered 503');
    });
});
