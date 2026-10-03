// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeServer } from '../testing/fakeApi';
import AgentTimeline from './AgentTimeline';
import { buildTimeline } from './timeline';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

const CHANGES = [
    { id: 9, at: '2026-10-03T12:05:00.000Z', actor: 'agent', via: 'claude.ai', run_id: 2, resource: 'applications', item_id: '3', action: 'update',
        before: { id: 3, company: 'Stripe', role: 'Intern', status: 'applied' }, after: { id: 3, company: 'Stripe', role: 'Intern', status: 'oa' } },
    { id: 7, at: '2026-10-03T12:02:00.000Z', actor: 'agent', via: 'claude.ai', run_id: 2, resource: 'tasks', item_id: '2', action: 'create',
        before: null, after: { id: 2, name: 'Reply to Stripe recruiter' } },
    { id: 4, at: '2026-10-02T12:01:00.000Z', actor: 'agent', via: 'claude.ai', run_id: 1, resource: 'tasks', item_id: '1', action: 'create',
        before: null, after: { id: 1, name: 'Pay rent' } },
];
const RUNS = [
    { id: 2, label: 'Email 2026-10-03', name: null, started_at: '2026-10-03T12:00:00.000Z', ended_at: '2026-10-03T12:09:00.000Z', summary: '1 task, Stripe moved to OA', briefing: 'Stripe OA due Fri · reply to the recruiter' },
    { id: 1, label: null, name: null, started_at: '2026-10-02T12:00:00.000Z', ended_at: '2026-10-02T12:03:00.000Z', summary: 'Rent', briefing: 'Rent due Thu' },
];

function setup({ runs = RUNS, changes = CHANGES, seen = '2026-10-02T12:03:00.000Z', since } = {}) {
    const api = fakeServer({
        'POST /api/changes/:id/undo': () => ({ undone: 7, item: null }),
        'POST /api/changes/undo-since': () => since ?? { undone: [CHANGES[0]], skipped: [{ change: CHANGES[1], reason: 'changed since' }] },
    });
    api.install();
    const onClose = vi.fn();
    render(<AgentTimeline entries={buildTimeline(runs, changes, seen).entries} onClose={onClose} />);
    return { api, onClose };
}

const changesTab = () => fireEvent.click(screen.getByRole('tab', { name: /^Changes/ }));

describe("the agent's timeline: Briefings", () => {
    it('opens on the briefings, newest first, without the changes', () => {
        setup();
        expect(screen.getByRole('dialog', { name: '✦ The agent' })).toBeTruthy();
        expect(screen.getByRole('tab', { name: 'Briefings' }).getAttribute('aria-selected')).toBe('true');
        const heads = [...document.querySelectorAll('.agent-entry-head .editor-title')].map(el => el.textContent);
        expect(heads[0]).toMatch(/^Email 2026-10-03 · Sat /);
        expect(heads[1]).toMatch(/^Run · Fri /);
        expect(screen.getByText('Stripe OA due Fri · reply to the recruiter')).toBeTruthy();
        // the summary says what the run did, so it's with the changes
        expect(screen.queryByText('1 task, Stripe moved to OA')).toBeNull();
        expect(screen.queryByText('Added task "Reply to Stripe recruiter"')).toBeNull();
        expect(screen.queryByText('Undo all new')).toBeNull();
    });

    it('draws a line between what is new and what Luke has seen', () => {
        setup();
        const body = document.querySelector('.agent-timeline-body');
        const order = [...body.children].map(el => (el.tagName === 'HR' ? 'line' : el.className));
        expect(order.slice(0, 3)).toEqual(['agent-entry new', 'line', 'agent-entry']);
    });

    it('has no line when everything is new', () => {
        setup({ seen: null });
        expect(document.querySelector('.agent-seen-line')).toBeNull();
    });

    it("links each briefing to its run's changes, scrolled to that run", () => {
        const scrolled = [];
        Element.prototype.scrollIntoView = function scrollIntoView() {
            scrolled.push(this.dataset.run);
        };
        setup();
        fireEvent.click(screen.getByText('1 change ›'));
        expect(screen.getByRole('tab', { name: 'Changes · 2 new' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText('Added task "Reply to Stripe recruiter"')).toBeTruthy();
        expect(scrolled).toEqual(['1']);
        delete Element.prototype.scrollIntoView;
    });

    it("says when a run is still going, didn't report, or changed nothing", () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-03T13:00:00.000Z'));
        setup({
            runs: [
                { id: 4, label: 'Email', started_at: '2026-10-03T12:30:00.000Z', ended_at: null, summary: null, briefing: null },
                { id: 3, label: 'Jobs', started_at: '2026-10-03T08:00:00.000Z', ended_at: null, summary: null, briefing: null },
            ],
            changes: [],
        });
        expect(screen.getByText('Still running')).toBeTruthy();
        expect(screen.getByText("Didn't report")).toBeTruthy();
        expect(screen.getAllByText('No changes')).toHaveLength(2);
    });

    it('leaves out changes in no run, which have no briefing', () => {
        setup({ runs: [], changes: [{ ...CHANGES[2], run_id: null }], seen: null });
        expect(screen.getByText('No briefings in the last few days.')).toBeTruthy();
    });
});

describe("the agent's timeline: Changes", () => {
    it('says how many changes are new on its tab, and lists each run under its summary', () => {
        setup();
        changesTab();
        expect(screen.getByText('1 task, Stripe moved to OA')).toBeTruthy();
        expect(screen.getByText('Added task "Reply to Stripe recruiter"')).toBeTruthy();
        expect(screen.getByText('Moved application "Stripe · Intern" to OA')).toBeTruthy();
        expect(screen.queryByText('Stripe OA due Fri · reply to the recruiter')).toBeNull();
        // new above the line, seen below it
        expect(document.querySelectorAll('.agent-seen-line')).toHaveLength(1);
    });

    it('undoes one change, and marks it undone', async () => {
        const { api } = setup();
        changesTab();
        fireEvent.click(screen.getAllByText('Undo')[1]);
        expect(await screen.findByText('Undone')).toBeTruthy();
        expect(api.writes()).toEqual([{ method: 'POST', url: '/api/changes/7/undo', body: undefined }]);
        expect(screen.getByRole('tab', { name: 'Changes · 1 new' })).toBeTruthy();
        // and the briefing says so
        fireEvent.click(screen.getByRole('tab', { name: 'Briefings' }));
        expect(screen.getByText('2 changes (1 undone) ›')).toBeTruthy();
    });

    it('undoes one run on a second tap, by its id, listing what it skipped', async () => {
        const { api } = setup();
        changesTab();
        fireEvent.click(screen.getAllByText('Undo this run')[0]);
        expect(api.writes()).toEqual([]);
        fireEvent.click(screen.getByText('Tap again to undo this run'));
        expect(await screen.findByText(/Undid 1 change\. Couldn't undo 1: Added task "Reply to Stripe recruiter" \(changed since\)/)).toBeTruthy();
        expect(api.writes()).toEqual([{ method: 'POST', url: '/api/changes/undo-since', body: { run: 2, actors: ['agent'] } }]);
    });

    it('undoes everything new on a second tap, from the oldest new change', async () => {
        const { api } = setup({ since: { undone: [CHANGES[0], CHANGES[1]], skipped: [] } });
        changesTab();
        fireEvent.click(screen.getByText('Undo all new'));
        fireEvent.click(screen.getByText('Tap again to undo all new'));
        expect(await screen.findByText('Undid 2 changes.')).toBeTruthy();
        expect(api.writes()).toEqual([{ method: 'POST', url: '/api/changes/undo-since', body: { since: '2026-10-03T12:02:00.000Z', actors: ['agent'] } }]);
        // nothing new left to undo
        await waitFor(() => expect(screen.queryByText('Undo all new')).toBeNull());
        expect(screen.getByRole('tab', { name: 'Changes' })).toBeTruthy();
    });

    it('shows changes in no run, with Undo but no Undo this run, and leaves out runs that changed nothing', () => {
        const quiet = { id: 5, label: 'Quiet', started_at: '2026-10-03T13:00:00.000Z', ended_at: '2026-10-03T13:01:00.000Z', summary: 'Nothing new', briefing: 'A quiet day' };
        setup({ runs: [quiet], changes: [{ ...CHANGES[2], run_id: null }], seen: null });
        changesTab();
        expect(screen.getByText('Not in a run')).toBeTruthy();
        expect(screen.getByText('Undo')).toBeTruthy();
        expect(screen.queryByText('Undo this run')).toBeNull();
        expect(screen.queryByText('Nothing new')).toBeNull();
    });

    it('says when there are no changes at all', () => {
        setup({ changes: [] });
        changesTab();
        expect(screen.getByText('No changes in the last few days.')).toBeTruthy();
    });
});

describe("closing the agent's timeline", () => {
    it('closes with Done, ✕, Escape or a tap outside, from either tab', () => {
        const { onClose } = setup();
        fireEvent.click(screen.getByText('Done'));
        changesTab();
        fireEvent.click(screen.getByText('Done'));
        fireEvent.click(screen.getByLabelText('Close'));
        fireEvent.keyDown(document, { key: 'Escape' });
        fireEvent.click(document.querySelector('.agent-backdrop'));
        // a tap inside doesn't close it
        fireEvent.click(document.querySelector('.agent-timeline'));
        expect(onClose).toHaveBeenCalledTimes(5);
    });
});
