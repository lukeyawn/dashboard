import { daysBetween } from '../../../shared/dates';

// Which date to count down to (DESIGN §10, Countdown): a birthday within the
// next 7 days, otherwise the pinned countdown, otherwise the nearest one.
export function chooseCountdown({ todayDate, countdowns = [], birthdays = [] }) {
    const soonBirthday = birthdays.find(b => b.date >= todayDate && daysBetween(todayDate, b.date) <= 7);
    if (soonBirthday) return { label: soonBirthday.title, date: soonBirthday.date };
    const upcoming = countdowns.filter(c => c.target_date >= todayDate);
    const chosen = upcoming.find(c => c.pinned) ?? upcoming[0];
    return chosen ? { label: chosen.label, date: chosen.target_date } : null;
}

// Days when 60 or fewer remain, otherwise weeks; "Today" on the day itself
export function countdownNumber(days) {
    if (days === 0) return { number: 'Today', unit: null };
    if (days <= 60) return { number: String(days), unit: days === 1 ? 'day' : 'days' };
    const weeks = Math.round(days / 7);
    return { number: String(weeks), unit: 'weeks' };
}
