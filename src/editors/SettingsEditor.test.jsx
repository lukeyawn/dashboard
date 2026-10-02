// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeServer } from '../testing/fakeApi';
import SettingsEditor from './SettingsEditor';

afterEach(() => vi.unstubAllGlobals());

function setup(assignmentsArea) {
    let settings = { night_start: '22:00', night_end: '06:30', week_start: 'sunday', assignments_area: assignmentsArea };
    const api = fakeServer({
        'GET /api/settings': () => settings,
        'PATCH /api/settings': ({ body }) => (settings = { ...settings, ...body }),
        'GET /api/night': () => ({ active: false, early: false, until: null, start: '22:00', end: '06:30' }),
        'GET /api/areas': () => [{ id: 1, name: 'School' }, { id: 4, name: 'Home' }],
    });
    api.install();
    render(<SettingsEditor />);
    return api;
}

describe('SettingsEditor', () => {
    it("chooses the Assignments tile's area, by id", async () => {
        const api = setup(1);
        const select = await screen.findByLabelText('Assignments area');
        expect([...select.options].map(o => o.textContent)).toEqual(['School', 'Home']);
        fireEvent.change(select, { target: { value: '4' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
        await waitFor(() => expect(api.writes()).toEqual([{ method: 'PATCH', url: '/api/settings', body: { assignments_area: 4 } }]));
    });

    it('asks for an area once the chosen one is deleted', async () => {
        setup(null);
        const select = await screen.findByLabelText('Assignments area');
        expect(select.value).toBe('');
        expect(select.options[0].textContent).toBe('Pick an area');
    });
});
