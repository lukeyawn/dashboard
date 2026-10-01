// Display formatting shared by widgets.

// 7, 64.5, 0.3: at most one decimal, and none when it's whole
export function formatNumber(n) {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

// "9:00 AM"
export function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
