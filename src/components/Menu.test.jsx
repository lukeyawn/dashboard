// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Menu from './Menu';

function setup() {
    const pick = vi.fn();
    const toggle = vi.fn();
    render(
        <Menu label="Filter" sections={[
            { items: [{ key: 'all', label: 'All', checked: true, onSelect: () => pick('all') }, { key: 'school', label: 'School', onSelect: () => pick('school') }] },
            { title: 'Time', items: [{ key: 'quick', label: '15 min or less', toggle: true, checked: false, onSelect: toggle }] },
        ]} />,
    );
    return { pick, toggle };
}

describe('Menu', () => {
    it('opens to show its choices, with the current ones checked', () => {
        setup();
        expect(screen.queryByRole('menu')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Filter ▾' }));
        expect(screen.getByRole('menu', { name: 'Filter' })).toBeTruthy();
        expect(screen.getAllByRole('menuitemradio').map(i => [i.textContent, i.getAttribute('aria-checked')])).toEqual([['✓All', 'true'], ['School', 'false']]);
        expect(screen.getByRole('menuitemcheckbox', { name: '15 min or less' }).getAttribute('aria-checked')).toBe('false');
        expect(screen.getByRole('group', { name: 'Time' })).toBeTruthy();
    });

    it('closes on a choice, and makes it', () => {
        const { pick, toggle } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Filter ▾' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'School' }));
        expect(pick).toHaveBeenCalledWith('school');
        expect(screen.queryByRole('menu')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Filter ▾' }));
        fireEvent.click(screen.getByRole('menuitemcheckbox'));
        expect(toggle).toHaveBeenCalledOnce();
    });

    it('closes without choosing on a tap outside, or Escape', () => {
        const { pick } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Filter ▾' }));
        fireEvent.click(document.querySelector('.menu-backdrop'));
        expect(screen.queryByRole('menu')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Filter ▾' }));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('menu')).toBeNull();
        expect(pick).not.toHaveBeenCalled();
    });
});
