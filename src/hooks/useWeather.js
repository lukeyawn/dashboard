import { useEffect, useState } from 'react';
import { reportKioskLocation, roughly } from '../lib/location';
import { useResource } from './useResource';

const WEATHER_POLL_MS = 30 * 60 * 1000;

// The weather for this device's own location if the browser shares it,
// otherwise for wherever the kiosk is (DESIGN §10, Dock)
export function useWeather() {
    const [device, setDevice] = useState(null);

    useEffect(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => setDevice({ lat: roughly(coords.latitude), lon: roughly(coords.longitude) }),
            () => {}, // refused or unavailable, as on the kiosk: the server picks a place
            { timeout: 10_000, maximumAge: WEATHER_POLL_MS },
        );
    }, []);

    const weather = useResource('weather', { params: device ?? undefined, pollMs: WEATHER_POLL_MS });

    const reportLocation = Boolean(weather.data?.report_location);
    const { refresh } = weather;
    useEffect(() => {
        if (reportLocation) reportKioskLocation().then(refresh, () => {});
    }, [reportLocation, refresh]);

    return weather;
}
