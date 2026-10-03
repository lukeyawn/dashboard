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

describe('JobWidget', () => {
    it('lists OAs, interviews and offers by the next step, then the applied ones, muted, and never the archived', async () => {
        await setup();
        expect(companies()).toEqual(['Jane Street', 'Stripe', 'Ramp', 'Figma', 'Notion']);
        expect([...document.querySelectorAll('.job-row.spare .job-company')].map(c => c.textContent)).toEqual(['Figma', 'Notion']);
        expect([...document.querySelectorAll('.job-date')].map(d => d.textContent)).toEqual(['due Fri', 'Tue 2 PM', 'by Oct 20', 'Sep 28', 'Sep 20']);
        // within 2 days
        expect(row('Jane Street').querySelector('.job-date').classList.contains('urgent')).toBe(true);
        expect(row('Stripe').querySelector('.job-date').classList.contains('urgent')).toBe(false);
        // no stage counts any more
        expect(document.querySelector('.job-stages')).toBeNull();
    });

    it('selects the top row, and another with a tap; the pill is only a label', async () => {
        const api = await setup();
        expect(within(panel()).getByText('Jane Street · Intern')).toBeTruthy();
        expect(within(panel()).getByText('OA · due Fri, Oct 2')).toBeTruthy();
        fireEvent.click(within(row('Stripe')).getByText('Interview'));
        expect(within(panel()).getByText('Stripe · Intern')).toBeTruthy();
        expect(within(panel()).getByText('Interview · Tue, Oct 6, 2:00 PM')).toBeTruthy();
        expect(within(panel()).getByText('Applied Sep 1')).toBeTruthy();
        expect(within(panel()).getByText('Recruiter: Dana.')).toBeTruthy();
        expect(row('Stripe').querySelector('.job-select').getAttribute('aria-pressed')).toBe('true');
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        expect(api.writes()).toEqual([]);
    });

    it('changes the stage from Stage ▾ after 5 seconds, clearing the old next step', async () => {
        const api = await setup();
        fireEvent.click(screen.getByRole('button', { name: 'Stage ▾' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Interview' }));
        expect(row('Jane Street').classList.contains('pending')).toBe(true);
        expect(within(panel()).getByText('→ Interview · Cancel')).toBeTruthy();
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS - 1));
        expect(api.writes()).toEqual([]);
        await act(() => vi.advanceTimersByTimeAsync(1));
        expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/applications/3', body: { status: 'interview', next_on: null, next_time: null } }]);
        expect(within(row('Jane Street')).getByText('Interview')).toBeTruthy();
    });

    it('cancels a stage change with a second tap, and rejects only through the pending tap', async () => {
        const api = await setup();
        fireEvent.click(screen.getByRole('button', { name: 'Stage ▾' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Rejected' }));
        fireEvent.click(within(panel()).getByText('→ Rejected · Cancel'));
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        expect(api.writes()).toEqual([]);
        expect(companies()).toContain('Jane Street');

        // choosing the current stage does nothing
        fireEvent.click(screen.getByRole('button', { name: 'Stage ▾' }));
        expect(screen.getByRole('menuitemradio', { name: 'OA' }).getAttribute('aria-checked')).toBe('true');
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'OA' }));
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        expect(api.writes()).toEqual([]);

        fireEvent.click(screen.getByRole('button', { name: 'Stage ▾' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Rejected' }));
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        // archived: off the tile, and the next one is selected
        expect(companies()).not.toContain('Jane Street');
        expect(within(panel()).getByText('Stripe · Intern')).toBeTruthy();
    });

    it('opens the posting, and a Prepare chat for OAs and interviews only', async () => {
        await setup();
        const links = () => [...panel().querySelectorAll('.job-link')].map(l => l.textContent);
        expect(links()).toEqual(['Prepare']);
        const prepare = within(panel()).getByText('Prepare');
        expect(prepare.getAttribute('href')).toMatch(/^https:\/\/claude\.ai\/new\?q=Help%20me%20prepare%20for%20the%20online%20assessment/);
        expect(prepare.getAttribute('target')).toBe('_blank');

        fireEvent.click(row('Stripe').querySelector('.job-select'));
        expect(links()).toEqual(['↗ Posting', 'Prepare']);
        // your link opens without asking
        expect(fireEvent.click(within(panel()).getByText('↗ Posting'))).toBe(true);
        expect(screen.queryByRole('dialog')).toBeNull();

        // Claude's link carries a ✦
        fireEvent.click(row('Ramp').querySelector('.job-select'));
        expect(links()).toEqual(['↗ Posting ✦']);
    });

    it("asks before opening a posting link Claude wrote", async () => {
        await setup();
        fireEvent.click(row('Ramp').querySelector('.job-select'));
        expect(fireEvent.click(within(panel()).getByText('↗ Posting'))).toBe(false);
        expect(screen.getByText('Open evil.example?')).toBeTruthy();
        expect(screen.getByText('Claude added this link.')).toBeTruthy();
    });

    it('hides ↗ Posting and Prepare on the kiosk', async () => {
        await setup({ client: 'kiosk' });
        fireEvent.click(row('Stripe').querySelector('.job-select'));
        expect(within(panel()).getByText('Stripe · Intern')).toBeTruthy();
        expect(panel().querySelector('.job-links')).toBeNull();
    });

    it('goes back to the top row on the kiosk after 5 minutes idle, and not elsewhere', async () => {
        await setup({ client: 'kiosk' });
        fireEvent.click(row('Ramp').querySelector('.job-select'));
        await act(() => vi.advanceTimersByTimeAsync(IDLE_MS));
        expect(within(panel()).getByText('Jane Street · Intern')).toBeTruthy();
    });

    it('keeps the selection on other screens', async () => {
        await setup();
        fireEvent.click(row('Ramp').querySelector('.job-select'));
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
