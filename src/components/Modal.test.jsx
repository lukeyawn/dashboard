// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EditButton from './EditButton';
import Modal from './Modal';

describe('Modal', () => {
    it('renders into the body and closes on Escape, ✕ or a tap outside', () => {
        const onClose = vi.fn();
        const { container } = render(<div className="shell"><Modal title="Tasks" onClose={onClose}>inside</Modal></div>);
        const dialog = screen.getByRole('dialog', { name: 'Tasks' });
        expect(container.contains(dialog)).toBe(false);
        expect(document.activeElement).toBe(dialog);

        fireEvent.keyDown(document, { key: 'Escape' });
        fireEvent.click(screen.getByLabelText('Close'));
        fireEvent.click(dialog);
        expect(onClose).toHaveBeenCalledTimes(2);
        fireEvent.click(dialog.parentElement);
        expect(onClose).toHaveBeenCalledTimes(3);
    });
});

describe('EditButton', () => {
    it('opens the editor in the modal and reports when it closes', () => {
        const onClosed = vi.fn();
        render(<EditButton title="Tasks" editor={() => <p>the editor</p>} onClosed={onClosed} />);
        expect(screen.queryByText('the editor')).toBeNull();
        fireEvent.click(screen.getByLabelText('Edit tasks'));
        expect(screen.getByText('the editor')).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Close'));
        expect(screen.queryByText('the editor')).toBeNull();
        expect(onClosed).toHaveBeenCalled();
    });
});
