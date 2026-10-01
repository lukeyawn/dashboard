import { request } from './api';

// The kiosk looks up where its internet connection is and tells the server,
// which uses it for the weather when a device doesn't share its own location
// (DESIGN §10, Dock). The server asks for this at boot and about once a day.
let reported = false;

export async function reportKioskLocation(fetchImpl = fetch) {
    if (reported) return null;
    reported = true;
    const res = await fetchImpl('https://ipapi.co/json/');
    if (!res.ok) throw new Error(`The location lookup answered ${res.status}`);
    const place = await res.json();
    const name = [place.city, place.region_code].filter(Boolean).join(', ') || null;
    return request('/location/kiosk', { method: 'PUT', body: { lat: place.latitude, lon: place.longitude, name } });
}

// rounds to about 1 km: enough for weather, and it lets the server share one fetch per place
export function roughly(degrees) {
    return Math.round(degrees * 100) / 100;
}

export function resetForTests() {
    reported = false;
}
