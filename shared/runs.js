// The scheduled agent's runs (docs/AGENT.md §7), shared by the server and the
// dock's timeline.

// How long a run stays open for writes and its report. After that it's
// closed, and one that never reported shows in the status line, and as
// "didn't report" in the timeline.
export const RUN_OPEN_MS = 3 * 60 * 60 * 1000;

// A run's label, chosen by the agent, such as "Email 2026-10-03 06:00". It
// travels in a header, so it's plain ASCII: letters, digits, spaces and . _ : / -
export const RUN_LABEL = /^[A-Za-z0-9 ._:/-]{1,60}$/;

// a run that never reported: still going, or closed without a report
export function runState(run, now = Date.now()) {
    if (run.ended_at) return 'reported';
    return now - Date.parse(run.started_at) > RUN_OPEN_MS ? 'unreported' : 'running';
}
