// A goal's deadline and pace (docs/BLOCKS.md §5), for the tile and Claude.
import { daysBetween, parseDate } from './dates.js';

// behind by more than this share of the target turns the bar amber
export const BEHIND_SHARE = 0.1;

// Where steady progress from started to the deadline would be today, and
// whether the goal is far enough behind it to show. Null without a deadline.
// The expected amount runs from 0 on the start day to the target on the
// deadline, and stays within them before and after.
export function pace(goal, todayDate) {
    if (!goal.deadline || goal.kind === 'milestone') return null;
    const total = daysBetween(goal.started, goal.deadline);
    const share = total <= 0 ? 1 : Math.min(1, Math.max(0, daysBetween(goal.started, todayDate) / total));
    const expected = goal.target * share;
    return { expected, share, behind: expected - goal.current > BEHIND_SHARE * goal.target };
}

// "3 days left", "3 wk left", "4 mo left": coarser the further off it is
export function timeLeft(deadline, todayDate) {
    const days = daysBetween(todayDate, deadline);
    if (days < 0) return 'past the deadline';
    if (days === 0) return 'due today';
    if (days === 1) return '1 day left';
    if (days < 14) return `${days} days left`;
    if (days < 60) return `${Math.floor(days / 7)} wk left`;
    return `${Math.floor(days / 30)} mo left`;
}

// "Dec 31", with the year when it isn't this one
export function shortDeadline(deadline, todayDate) {
    const date = parseDate(deadline);
    const sameYear = deadline.slice(0, 4) === todayDate.slice(0, 4);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
