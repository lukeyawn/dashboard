// How the Job search tile splits and orders applications (docs/BLOCKS.md §6),
// shared by the tile and /api/today.

// how a stage is named on the pill, in the panel and in History
export const STAGE_NAMES = {
    to_apply: 'To apply', applied: 'Applied', oa: 'OA', interview: 'Interview', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn',
};

// archived: off the tile
export const ARCHIVED = ['rejected', 'withdrawn'];
// always yours to act on: an OA to take, an offer to answer
const ALWAYS_ACTION = ['oa', 'offer'];

export const isArchived = application => ARCHIVED.includes(application.status);

// Needs action: every OA and offer, and anything else sent with a next step
// from today on, such as a scheduled interview. To apply is a list of its
// own, and the rest is waiting on them.
export function needsAction(application, todayDate) {
    if (application.status === 'to_apply') return false;
    return ALWAYS_ACTION.includes(application.status) || Boolean(application.next_on && application.next_on >= todayDate);
}

// by the next step's date and time, none last
const byNextStep = (a, b) => (a.next_on ?? '9999').localeCompare(b.next_on ?? '9999')
    || (a.next_time ?? '99').localeCompare(b.next_time ?? '99')
    || b.id - a.id;

// interviews first, then the most recent: the step's date, or the date applied
const STAGE_ORDER = { offer: 0, interview: 1, oa: 2, applied: 3 };
const latest = a => (a.next_on && a.next_on > a.applied_on ? a.next_on : a.applied_on);
const byWaiting = (a, b) => (STAGE_ORDER[a.status] ?? 9) - (STAGE_ORDER[b.status] ?? 9)
    || latest(b).localeCompare(latest(a))
    || b.id - a.id;

// the tile's three lists, each in its order; archived ones are in none. To
// apply goes by the day to apply by, the newest first without one.
export function jobSections(applications, todayDate) {
    const open = applications.filter(a => !isArchived(a));
    const toApply = open.filter(a => a.status === 'to_apply');
    const sent = open.filter(a => a.status !== 'to_apply');
    return {
        needsAction: sent.filter(a => needsAction(a, todayDate)).sort(byNextStep),
        toApply: toApply.sort(byNextStep),
        waitingOn: sent.filter(a => !needsAction(a, todayDate)).sort(byWaiting),
    };
}
