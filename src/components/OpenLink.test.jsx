// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OpenLink from './OpenLink';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('OpenLink', () => {
    it('opens a link you wrote in a new tab, without asking', () => {
        render(<OpenLink url="https://stripe.com/jobs" byClaude={false}>Posting</OpenLink>);
        const link = screen.getByText('Posting');
        expect(link.getAttribute('href')).toBe('https://stripe.com/jobs');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        // the browser follows it; nothing stops the click
        expect(fireEvent.click(link)).toBe(true);
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryByLabelText('added by Claude')).toBeNull();
    });

    it("asks first for a link Claude wrote, naming its domain, and opens it only on Open", () => {
        const open = vi.fn();
        vi.stubGlobal('open', open);
        render(<OpenLink url="https://stripe.com.evil.example/?d=secret" byClaude>Posting</OpenLink>);
        expect(screen.getByLabelText('added by Claude')).toBeTruthy();
        expect(fireEvent.click(screen.getByText('Posting'))).toBe(false);
        expect(screen.getByText('Open stripe.com.evil.example?')).toBeTruthy();
        expect(screen.getByText('Claude added this link.')).toBeTruthy();
        fireEvent.click(screen.getByText('Cancel'));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(open).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('Posting'));
        fireEvent.click(screen.getByText('Open'));
        expect(open).toHaveBeenCalledWith('https://stripe.com.evil.example/?d=secret', '_blank', 'noopener,noreferrer');
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
