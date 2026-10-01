// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeServer, json } from '../testing/fakeApi';
import ClaudeMark from './ClaudeMark';

afterEach(() => vi.unstubAllGlobals());

const CHANGE = { id: 7, at: '2026-10-01T14:14:00.000Z', actor: 'claude', via: 'claude.ai' };

describe('ClaudeMark', () => {
    it('says who added the item and undoes it', async () => {
        const api = fakeServer({ 'POST /api/changes/:id/undo': () => ({ undone: 7, item: null }) });
        api.install();
        const onUndone = vi.fn();
        const onRowClick = vi.fn();
        render(<div onClick={onRowClick}><ClaudeMark change={CHANGE} name="Email Prof. Lee" onUndone={onUndone} /></div>);
        fireEvent.click(screen.getByLabelText('Added by Claude (claude.ai)'));
        // the tap doesn't reach the row underneath
        expect(onRowClick).not.toHaveBeenCalled();
        expect(screen.getByText('Email Prof. Lee')).toBeTruthy();
        expect(screen.getByText(/^Added by Claude \(claude\.ai\), Oct 1/)).toBeTruthy();
        fireEvent.click(screen.getByText('Undo'));
        await waitFor(() => expect(onUndone).toHaveBeenCalled());
        expect(api.writes()).toEqual([{ method: 'POST', url: '/api/changes/7/undo', body: undefined }]);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('explains when it cannot undo, and can be closed', async () => {
        fakeServer({ 'POST /api/changes/:id/undo': () => json(409, { error: { message: 'It has changed since.', details: [] } }) }).install();
        render(<ClaudeMark change={{ ...CHANGE, via: 'claude-code' }} name="Laundry" />);
        fireEvent.click(screen.getByLabelText('Added by Claude Code'));
        fireEvent.click(screen.getByText('Undo'));
        expect((await screen.findByRole('status')).textContent).toBe("Couldn't undo. It has changed since.");
        fireEvent.click(screen.getByText('Keep it'));
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
