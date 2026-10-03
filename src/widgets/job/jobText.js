import { STAGE_NAMES } from '../../../shared/applications';
import { daysBetween, parseDate } from '../../../shared/dates';
import { formatTime } from '../../lib/format';
import { isUrgent } from '../assignments/daysLabel';

const monthDay = date => parseDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// "today", a weekday within 6 days ("Fri"), otherwise "Oct 20": short, so
// the row's date column stays narrow
function shortDay(todayDate, date) {
    const days = daysBetween(todayDate, date);
    if (days === 0) return 'today';
    if (days > 0 && days <= 6) return parseDate(date).toLocaleDateString('en-US', { weekday: 'short' });
    return monthDay(date);
}

const clock = time => {
    const [h, m] = time.split(':').map(Number);
    return new Date(2000, 0, 1, h, m);
};

// "2 PM", "2:30 PM"
const shortTime = time => clock(time).toLocaleTimeString('en-US', { hour: 'numeric', ...(time.endsWith(':00') ? {} : { minute: '2-digit' }) });

// "Tue, Oct 6, 2:00 PM"
function longStep(date, time) {
    const day = parseDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return time ? `${day}, ${formatTime(clock(time))}` : day;
}

// what the next step's date is: an OA is due, an offer needs a reply by
const PREFIX = { oa: 'due', offer: 'reply by' };
const ROW_PREFIX = { oa: 'due', offer: 'by' };

// A row's date: the next step's ("due Fri", "Tue 2 PM", "by Oct 20"), or
// for an applied one without a step, the day it was sent ("Sep 28").
// urgent within 2 days, overdue included.
export function rowDate(application, todayDate) {
    const { status, next_on: on, next_time: time } = application;
    if (!on) return status === 'applied' ? { text: monthDay(application.applied_on), urgent: false } : null;
    const text = [ROW_PREFIX[status], shortDay(todayDate, on), time && shortTime(time)].filter(Boolean).join(' ');
    return { text, urgent: isUrgent(daysBetween(todayDate, on)) };
}

// The next step in full: "Tue, Oct 6, 2:00 PM", "reply by Tue, Oct 20", or null
export function stepWhen(application) {
    const { status, next_on: on, next_time: time } = application;
    return on ? [PREFIX[status], longStep(on, time)].filter(Boolean).join(' ') : null;
}

// The panel's next step: "Interview · Tue, Oct 6, 2:00 PM", "Offer · reply by Tue, Oct 20"
export function nextStep(application) {
    const when = stepWhen(application);
    return when && `${STAGE_NAMES[application.status]} · ${when}`;
}

// "Applied Sep 12"
export const appliedText = application => `Applied ${monthDay(application.applied_on)}`;
