// Weather from Open-Meteo, which needs no API key (DESIGN §10, Dock).

export const AUSTIN = { lat: 30.27, lon: -97.74, name: 'Austin, TX' };
const CACHE_MS = 30 * 60 * 1000;
// the kiosk reports its location at boot and once a day; this leaves some slack
export const KIOSK_REPORT_EVERY_MS = 20 * 60 * 60 * 1000;

// WMO weather codes, as Open-Meteo returns them
const CONDITIONS = [
    [[0], 'Clear'],
    [[1], 'Mostly clear'],
    [[2], 'Partly cloudy'],
    [[3], 'Overcast'],
    [[45, 48], 'Fog'],
    [[51, 53, 55, 56, 57], 'Drizzle'],
    [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain'],
    [[71, 73, 75, 77, 85, 86], 'Snow'],
    [[95, 96, 99], 'Thunderstorms'],
];

export function conditionOf(code) {
    return CONDITIONS.find(([codes]) => codes.includes(code))?.[1] ?? 'Unknown';
}

// The device's own location if it sent one, otherwise the kiosk's last report,
// otherwise Austin
export function chooseLocation(device, kiosk) {
    if (device) return { lat: device.lat, lon: device.lon, name: null, source: 'device' };
    if (kiosk) return { lat: kiosk.lat, lon: kiosk.lon, name: kiosk.name ?? null, source: 'kiosk' };
    return { ...AUSTIN, source: 'default' };
}

export function forecastUrl({ lat, lon }) {
    const params = new URLSearchParams({
        latitude: lat.toFixed(3),
        longitude: lon.toFixed(3),
        current: 'temperature_2m,weather_code',
        daily: 'temperature_2m_max,temperature_2m_min',
        temperature_unit: 'fahrenheit',
        timezone: 'auto',
        forecast_days: '1',
    });
    return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function createWeather({ fetch = globalThis.fetch, now = Date.now } = {}) {
    // one entry per location rounded to about 1 km, so many devices share a fetch
    const cache = new Map();

    // Resolves to { temperature, condition, high, low, unit, fetched_at }. A failed
    // fetch falls back to the last answer for that place, however old.
    return async function weatherAt({ lat, lon }) {
        const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
        const cached = cache.get(key);
        if (cached && now() - cached.at < CACHE_MS) return cached.value;
        try {
            const res = await fetch(forecastUrl({ lat, lon }), { signal: AbortSignal.timeout(10_000) });
            if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
            const data = await res.json();
            const value = {
                temperature: Math.round(data.current.temperature_2m),
                condition: conditionOf(data.current.weather_code),
                high: Math.round(data.daily.temperature_2m_max[0]),
                low: Math.round(data.daily.temperature_2m_min[0]),
                unit: 'F',
                fetched_at: new Date(now()).toISOString(),
            };
            cache.set(key, { at: now(), value });
            return value;
        } catch (err) {
            if (cached) return cached.value;
            throw err;
        }
    };
}
