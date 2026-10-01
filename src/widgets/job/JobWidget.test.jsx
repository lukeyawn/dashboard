// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PENDING_MS } from '../../config';
import { fakeServer } from '../../testing/fakeApi';
import JobWidget from './JobWidget';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const app = (id, company, status, updated_at) => ({ id, company, role: 'Intern', status, updated_at });

function setup(apps) {
    const api = fakeServer({
        'GET /api/applications': () => apps,
        'POST /api/applications/:id/advance': ({ params }) => {
            const a = apps.find(x => x.id === Number(params.id));
            a.status = { applied: 'interview', interview: 'offer' }[a.status];
            return { ...a, updated_at: '2030-01-01T00:00:00.000Z' };
        },
    });
    api.install();
    render(<JobWidget />);
    return api;
}

describe('JobWidget', () => {
    it('counts each stage and lists the 3 most recently updated', async () => {
        setup([
            app(1, 'Old', 'applied', '2026-09-01T00:00:00Z'),
            app(2, 'Google', 'interview', '2026-09-29T00:00:00Z'),
            app(3, 'Jane Street', 'rejected', '2026-09-27T00:00:00Z'),
            app(4, 'Stripe', 'applied', '2026-09-28T00:00:00Z'),
        ]);
        await screen.findByText('Google');
        expect([...document.querySelectorAll('.job-stage-count')].map(c => c.textContent)).toEqual(['2', '1', '0', '1']);
        expect([...document.querySelectorAll('.job-company')].map(c => c.textContent)).toEqual(['Google', 'Stripe', 'Jane Street']);
    });

    it('advances after 5 seconds, and never offers to advance a rejection', async () => {
        const api = setup([app(1, 'Stripe', 'applied', '2026-09-28T00:00:00Z'), app(2, 'Jane Street', 'rejected', '2026-09-27T00:00:00Z')]);
        await screen.findByText('Stripe');
        expect(screen.getAllByRole('button')).toHaveLength(1);
        vi.useFakeTimers();
        fireEvent.click(screen.getByLabelText('Stripe: applied. Move to interview'));
        await act(() => vi.advanceTimersByTimeAsync(PENDING_MS));
        expect(api.writes()).toEqual([{ method: 'POST', url: '/api/applications/1/advance', body: undefined }]);
        expect(document.querySelector('.job-row .status-pill').textContent).toBe('interview');
    });

    it('shows when there are none', async () => {
        setup([]);
        expect(await screen.findByText('No applications yet.')).toBeTruthy();
    });
});
