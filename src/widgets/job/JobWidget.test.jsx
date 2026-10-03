// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_MS, PENDING_MS } from '../../config';
import { fakeServer } from '../../testing/fakeApi';
import JobWidget from './JobWidget';
import { nextStep, rowDate } from './jobText';

// noon on Wednesday 2026-09-30
const NOW = new Date(2026, 8, 30, 12, 0);
let apps;
const app = (id, company, status, fields = {}) => ({
    id, company, role: 'Intern', status, applied_on: '2026-09-01', next_on: null, next_time: null, url: null, notes: null, url_by_claude: false, ...fields,
});

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    apps = [
        app(1, 'Figma', 'applied', { applied_on: '2026-09-28' }),
        app(2, 'Stripe', 'interview', { next_on: '2026-10-06', next_time: '14:00', url: 'https://stripe.com/jobs', notes: 'Recruiter: Dana.' }),
        app(3, 'Jane Street', 'oa', { next_on: '2026-10-02' }),
        app(4, 'Citadel', 'rejected'),
        app(5, 'Palantir', 'withdrawn'),
        app(6, 'Ramp', 'offer', { next_on: '2026-10-20', url: 'https://evil.example/', url_by_claude: true }),
        app(7, 'Notion', 'applied', { applied_on: '2026-09-20' }),
    ];
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

async function setup({ client = 'api' } = {}) {
    const api = fakeServer({
        'GET /api/applications': () => apps,
        'GET /api/session': () => ({ client }),
        'PATCH /api/applications/:id': ({ params, body }) => Object.assign(apps.find(a => a.id === Number(params.id)), body),
    });
    api.install();
    render(<JobWidget />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    return api;
}

const companies = () => [...document.querySelectorAll('.job-company')].map(c => c.textContent);
const panel = () => document.querySelector('.job-panel');
const row = company => screen.getByText(company, { selector: '.job-company' }).closest('.job-row');

// the rows under one section's heading, as company names
const section = title => {
    const items = [...document.querySelectorAll('.job-list > li')];
    const from = items.findIndex(li => li.textContent === title);
    const rest = items.slice(from + 1);
    const to = rest.findIndex(li => li.classList.contains('job-section'));
    return (to === -1 ? rest : rest.slice(0, to)).filter(li => li.classList.contains('job-row')).map(li => li.querySelector('.job-company').textContent);
};
const open = company => fireEvent.click(row(company).querySelector('.job-select'));
const notesBox = () => within(panel()).getByLabelText('Notes');

describe('JobWidget', () => {
    it('splits Needs action from Waiting on, in order, with the role, and never the archived', async () => {
        apps.push(app(8, 'Google', 'interview', { next_on: '2026-09-29' }));
        await setup();
        expect(section('Needs action')).toEqual(['Jane Street', 'Stripe', 'Ramp']);
        // an interview whose date has passed is waiting on them; interviews come before applied ones
        expect(section('Waiting on')).toEqual(['Google', 'Figma', 'Notion']);
        expect(companies()).not.toContain('Citadel');
        expect([...document.querySelectorAll('.job-row.spare .job-company')].map(c => c.textContent)).toEqual(['Figma', 'Notion']);
        expect([...document.querySelectorAll('.job-date')].map(d => d.textContent)).toEqual(['due Fri', 'Tue 2 PM', 'by Oct 20', 'Sep 29', 'Sep 28', 'Sep 20']);
        expect(row('Stripe').querySelector('.job-name').textContent).toBe('Stripe · Intern');
        // within 2 days
        expect(row('Jane Street').querySelector('.job-date').classList.contains('urgent')).toBe(true);
        expect(row('Stripe').querySelector('.job-date').classList.contains('urgent')).toBe(false);
        // nothing open until a tap, and no stage counts
        expect(panel()).toBeNull();
        expect(document.querySelector('.job-stages')).toBeNull();
    });

    it('lists To apply between them, with the day to apply by', async () => {
        apps.push(
            app(8, 'Anthropic', 'to_apply', { applied_on: null, next_on: '2026-10-09' }),
            app(9, 'Databricks', 'to_apply', { applied_on: null }),
        );
        await setup();
        expect(section('To apply')).toEqual(['Anthropic', 'Databricks']);
        expect([...document.querySelectorAll('.job-list > li')].filter(li => li.classList.contains('job-section')).map(li => li.textContent))
            .toEqual(['Needs action', 'To apply', 'Waiting on']);
        expect(row('Anthropic').querySelector('.job-date').textContent).toBe('by Oct 9');
        open('Databricks');
        expect(within(panel()).getByText('Not applied yet')).toBeTruthy();
    });

    it('puts ↗ to the posting and Prepare in the row, but not on the kiosk', async () => {
        await setup();
        expect(within(row('Stripe')).getByLabelText('Stripe posting').getAttribute('href')).toBe('https://stripe.com/jobs');
        expect(within(row('Ramp')).getByLabelText('Ramp posting, added by Claude')).toBeTruthy();
        expect(row('Jane Street').querySelector('.job-row-link')).toBeNull();
        expect(within(row('Stripe')).getByText('Prepare').getAttribute('href')).toMatch(/^https:\/\/claude\.ai\/new\?q=/);
        expect(within(row('Jane Street')).getByText('Prepare')).toBeTruthy();
        expect(row('Ramp').querySelector('.job-row-prepare')).toBeNull();
        expect(row('Figma').querySelector('.job-row-prepare')).toBeNull();
        // the row's ↗ asks first for Claude's link, without opening the panel
        expect(fireEvent.click(within(row('Ramp')).getByLabelText('Ramp posting, added by Claude'))).toBe(false);
        expect(screen.getByText('Open evil.example?')).toBeTruthy();
        expect(panel()).toBeNull();
    });

    it('says when nothing needs action', async () => {
        apps = [app(1, 'Figma', 'applied')];
        await setup();
        expect(screen.getByText('Nothing right now.')).toBeTruthy();
        expect(section('Waiting on')).toEqual(['Figma']);
    });

    it('opens the panel on a tap, narrowing the rows, and closes it with ✕ or a second tap', async () => {
        const api = await setup();
        open('Stripe');
        expect(within(panel()).getByText('Stripe · Intern')).toBeTruthy();
        expect(within(panel()).getByText('Interview · Tue, Oct 6, 2:00 PM')).toBeTruthy();
        expect(within(panel()).getByText('Applied Sep 1')).toBeTruthy();
        expect(notesBox().value).toBe('Recruiter: Dana.');
        expect(row('Stripe').querySelector('.job-select').getAttribute('aria-pressed')).toBe('true');
        // the rows keep everything but Prepare, which moves to the panel
        expect(row('Stripe').querySelector('.job-name').textContent).toBe('Stripe · Intern');
        expect(row('Stripe').querySelector('.job-row-prepare')).toBeNull();
        expect(within(panel()).getByText('Prepare')).toBeTruthy();

        open('Stripe');
        expect(panel()).toBeNull();
        expect(row('Stripe').querySelector('.job-row-prepare')).toBeTruthy();
        open('Jane Street');
        expect(within(panel()).getByText('OA · due Fri, Oct 2')).toBeTruthy();
        fireEvent.click(within(panel()).getByLabelText('Close'));
        expect(panel()).toBeNull();
        open('Ramp');
        expect(within(panel()).getByText('Ramp · Intern')).toBeTruthy();
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        expect(api.writes()).toEqual([]);
    });

    it('saves the notes with Save', async () => {
        const api = await setup();
        open('Stripe');
        fireEvent.change(notesBox(), { target: { value: 'Recruiter: Dana. Ask about the team.' } });
        await act(async () => fireEvent.click(within(panel()).getByText('Save')));
        expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/applications/2', body: { notes: 'Recruiter: Dana. Ask about the team.' } }]);
        expect(within(panel()).getByText('Saved')).toBeTruthy();
        expect(within(panel()).queryByText('Save')).toBeNull();
    });

    it('saves the notes 30 seconds after the last keystroke', async () => {
        const api = await setup();
        open('Jane Street');
        fireEvent.change(notesBox(), { target: { value: 'Hacker' } });
        await act(() => vi.advanceTimersByTimeAsync(20_000));
        fireEvent.change(notesBox(), { target: { value: 'HackerRank, 90 min' } });
        await act(() => vi.advanceTimersByTimeAsync(29_000));
        expect(api.writes()).toEqual([]);
        await act(() => vi.advanceTimersByTimeAsync(1_000));
        expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/applications/3', body: { notes: 'HackerRank, 90 min' } }]);
    });

    it('saves unsaved notes when the panel closes or moves to another application', async () => {
        const api = await setup();
        open('Jane Street');
        fireEvent.change(notesBox(), { target: { value: 'HackerRank' } });
        open('Stripe');
        fireEvent.change(notesBox(), { target: { value: 'Two rounds' } });
        await act(async () => fireEvent.click(within(panel()).getByLabelText('Close')));
        expect(api.writes().map(w => [w.url, w.body])).toEqual([['/api/applications/3', { notes: 'HackerRank' }], ['/api/applications/2', { notes: 'Two rounds' }]]);
        await act(() => vi.advanceTimersByTimeAsync(30_000));
        expect(api.writes()).toHaveLength(2);
    });

    it('keeps the edit when saving fails, and follows the stored notes while there is none', async () => {
        const api = await setup();
        open('Stripe');
        // Claude adds a prep summary: shown, since nothing was being edited
        apps[1].notes = 'Recruiter: Dana.\nPrep: graphs.';
        await act(() => vi.advanceTimersByTimeAsync(30_000));
        expect(notesBox().value).toBe('Recruiter: Dana.\nPrep: graphs.');

        fireEvent.change(notesBox(), { target: { value: 'Mine' } });
        api.failNext(500);
        await act(async () => fireEvent.click(within(panel()).getByText('Save')));
        expect(notesBox().value).toBe('Mine');
        expect(within(panel()).getByText("Couldn't save")).toBeTruthy();
        expect(within(panel()).getByText('Save')).toBeTruthy();
    });

    it('changes the stage from Stage ▾ after 5 seconds, clearing the old next step', async () => {
        const api = await setup();
        open('Jane Street');
        fireEvent.click(screen.getByRole('button', { name: 'Stage ▾' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Interview' }));
        expect(row('Jane Street').classList.contains('pending')).toBe(true);
        expect(within(panel()).getByText('→ Interview · Cancel')).toBeTruthy();
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS - 1));
        expect(api.writes()).toEqual([]);
        await act(() => vi.advanceTimersByTimeAsync(1));
        expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/applications/3', body: { status: 'interview', next_on: null, next_time: null } }]);
        // with no step ahead, it's waiting on them now
        expect(section('Waiting on')).toContain('Jane Street');
        expect(within(panel()).getByText('Jane Street · Intern')).toBeTruthy();
    });

    it('cancels a stage change with a second tap, and rejects only through the pending tap', async () => {
        const api = await setup();
        open('Jane Street');
        fireEvent.click(screen.getByRole('button', { name: 'Stage ▾' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Rejected' }));
        fireEvent.click(within(panel()).getByText('→ Rejected · Cancel'));
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        expect(api.writes()).toEqual([]);

        // choosing the current stage does nothing
        fireEvent.click(screen.getByRole('button', { name: 'Stage ▾' }));
        expect(screen.getByRole('menuitemradio', { name: 'OA' }).getAttribute('aria-checked')).toBe('true');
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'OA' }));
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        expect(api.writes()).toEqual([]);

        fireEvent.click(screen.getByRole('button', { name: 'Stage ▾' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Rejected' }));
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        // archived: off the tile, and its panel closes
        expect(companies()).not.toContain('Jane Street');
        expect(panel()).toBeNull();
    });

    it('opens the posting, and a Prepare chat for OAs and interviews only', async () => {
        await setup();
        const links = () => [...panel().querySelectorAll('.job-link')].map(l => l.textContent);
        open('Jane Street');
        expect(links()).toEqual(['Prepare']);
        const prepare = within(panel()).getByText('Prepare');
        expect(prepare.getAttribute('href')).toMatch(/^https:\/\/claude\.ai\/new\?q=Help%20me%20prepare%20for%20the%20online%20assessment/);
        expect(prepare.getAttribute('target')).toBe('_blank');

        open('Stripe');
        expect(links()).toEqual(['↗ Posting', 'Prepare']);
        // your link opens without asking
        expect(fireEvent.click(within(panel()).getByText('↗ Posting'))).toBe(true);
        expect(screen.queryByRole('dialog')).toBeNull();

        // Claude's link carries a ✦
        open('Ramp');
        expect(links()).toEqual(['↗ Posting ✦']);
    });

    it('asks before opening a posting link Claude wrote', async () => {
        await setup();
        open('Ramp');
        expect(fireEvent.click(within(panel()).getByText('↗ Posting'))).toBe(false);
        expect(screen.getByText('Open evil.example?')).toBeTruthy();
        expect(screen.getByText('Claude added this link.')).toBeTruthy();
    });

    it('hides ↗ Posting and Prepare on the kiosk', async () => {
        await setup({ client: 'kiosk' });
        expect(document.querySelector('.job-row-link, .job-row-prepare')).toBeNull();
        open('Stripe');
        expect(within(panel()).getByText('Stripe · Intern')).toBeTruthy();
        expect(panel().querySelector('.job-links')).toBeNull();
    });

    it('closes the panel on the kiosk after 5 minutes idle, with the notes saved', async () => {
        const api = await setup({ client: 'kiosk' });
        open('Ramp');
        fireEvent.change(notesBox(), { target: { value: 'Negotiate' } });
        // typing keeps the kiosk awake, so the notes are saved after 30
        // seconds, well before it closes, and not again on closing
        await act(() => vi.advanceTimersByTimeAsync(30_000));
        await act(() => vi.advanceTimersByTimeAsync(IDLE_MS - 30_000));
        expect(panel()).toBeNull();
        expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/applications/6', body: { notes: 'Negotiate' } }]);
    });

    it('keeps the panel open on other screens', async () => {
        await setup();
        open('Ramp');
        await act(() => vi.advanceTimersByTimeAsync(IDLE_MS));
        expect(within(panel()).getByText('Ramp · Intern')).toBeTruthy();
    });

    it('shows when there are none', async () => {
        apps = [];
        await setup();
        expect(screen.getByText('No applications yet.')).toBeTruthy();
    });

    it('says when every application is archived', async () => {
        apps = [app(1, 'Citadel', 'rejected')];
        await setup();
        expect(screen.getByText('Nothing open. Time to apply!')).toBeTruthy();
    });
});

describe('JobWidget and Claude', () => {
    it('marks an application Claude added', async () => {
        apps[2].claude_change = { id: 3, at: '2026-09-28T00:00:00Z', actor: 'claude', via: 'claude.ai' };
        await setup();
        expect(screen.getAllByLabelText('Added by Claude (claude.ai)')).toHaveLength(1);
    });
});

describe('the next step in words', () => {
    const today = '2026-09-30';
    it('reads a row date by stage', () => {
        expect(rowDate(app(1, 'A', 'oa', { next_on: '2026-09-30' }), today)).toEqual({ text: 'due today', urgent: true });
        expect(rowDate(app(1, 'A', 'interview', { next_on: '2026-10-01', next_time: '09:30' }), today)).toEqual({ text: 'Thu 9:30 AM', urgent: true });
        expect(rowDate(app(1, 'A', 'offer', { next_on: '2026-09-29' }), today)).toEqual({ text: 'by Sep 29', urgent: true });
        expect(rowDate(app(1, 'A', 'interview'), today)).toBeNull();
        expect(rowDate(app(1, 'A', 'applied', { applied_on: '2026-09-12' }), today)).toEqual({ text: 'Sep 12', urgent: false });
    });

    it('reads the panel line', () => {
        expect(nextStep(app(1, 'A', 'offer', { next_on: '2026-10-20' }))).toBe('Offer · reply by Tue, Oct 20');
        expect(nextStep(app(1, 'A', 'interview', { next_on: '2026-10-06', next_time: '14:00' }))).toBe('Interview · Tue, Oct 6, 2:00 PM');
        expect(nextStep(app(1, 'A', 'oa'))).toBeNull();
    });
});
