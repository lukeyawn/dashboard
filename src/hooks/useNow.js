import { useEffect, useState } from 'react';

// The current time, refreshed every intervalMs (DESIGN §6). The dock ticks
// every second; widgets use the default minute so dates roll over at midnight.
export function useNow(intervalMs = 60_000) {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);

    return now;
}
