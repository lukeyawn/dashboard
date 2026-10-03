import { describe, expect, it } from 'vitest';
import { domainOf, formatNumber, formatTime } from './format';

describe('format', () => {
    it('shows at most one decimal', () => {
        expect(formatNumber(7)).toBe('7');
        expect(formatNumber(64.5)).toBe('64.5');
        expect(formatNumber(0.333)).toBe('0.3');
    });

    it('formats a time of day', () => {
        expect(formatTime(new Date(2026, 8, 30, 13, 5))).toBe('1:05 PM');
    });

    it("reads a link's domain, or gives the text back when it isn't a link", () => {
        expect(domainOf('https://stripe.com.evil.example:8443/a?b=c')).toBe('stripe.com.evil.example');
        expect(domainOf('not a link')).toBe('not a link');
    });
});
