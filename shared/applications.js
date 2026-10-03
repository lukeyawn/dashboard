// Which applications the Job search tile shows, and in what order
// (docs/BLOCKS.md §6), shared by the tile and /api/today.

// how a stage is named on the pill, in the panel and in History
export const STAGE_NAMES = {
    applied: 'Applied', oa: 'OA', interview: 'Interview', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn',
};

// archived: off the tile, even as spare rows
export const ARCHIVED = ['rejected', 'withdrawn'];
// the stages with a next step to show: an OA, an interview, or an offer to answer
export const ACTIVE = ['oa', 'interview', 'offer'];

export const isArchived = application => ARCHIVED.includes(application.status);
export const isActive = application => ACTIVE.includes(application.status);

// OA, interview and offer applications first, by the next step's date and
// time (none last); then the rest, the most recently applied first, as spare
// rows so the tile isn't empty early in a search
export function compareApplications(a, b) {
    return isActive(b) - isActive(a)
        || (isActive(a)
            ? (a.next_on ?? '9999').localeCompare(b.next_on ?? '9999') || (a.next_time ?? '99').localeCompare(b.next_time ?? '99')
            : b.applied_on.localeCompare(a.applied_on))
        || b.id - a.id;
}

// the tile's applications, in its order
export function boardApplications(applications) {
    return applications.filter(a => !isArchived(a)).sort(compareApplications);
}
