import { describe, expect, it } from 'vitest';
import { checkLink, cleanBody, cleanConnectorWrites, cleanText } from './clean.js';

describe('cleanText', () => {
    it('removes bidirectional overrides that make text read backwards', () => {
        // "invoice\u202Efdp.exe" displays as "invoiceexe.pdf"
        expect(cleanText('invoice\u202Efdp.exe')).toBe('invoicefdp.exe');
        expect(cleanText('a\u2066b\u2069c\u200Fd\u061Ce')).toBe('abcde');
    });

    it('removes zero-width characters and control characters', () => {
        expect(cleanText('pa\u200By\u200Dpal\uFEFF')).toBe('paypal');
        expect(cleanText('bell\u0007 and\u001B esc\u0085')).toBe('bell and esc');
    });

    it('normalizes, trims, and turns newlines into spaces unless multiline', () => {
        expect(cleanText('  cafe\u0301 \r\n')).toBe('caf\u00E9');
        expect(cleanText('one\ntwo\r\n\nthree')).toBe('one two three');
        expect(cleanText('one\r\ntwo\tthree', { multiline: true })).toBe('one\ntwothree');
    });
});

describe('checkLink', () => {
    it('accepts https links and empty', () => {
        expect(() => checkLink('link', 'https://mail.google.com/mail/u/0/#all/abc')).not.toThrow();
        expect(() => checkLink('link', '')).not.toThrow();
    });

    it('refuses anything that is not a full https link, or too long', () => {
        for (const bad of ['http://example.com', 'javascript:alert(1)', 'example.com', 'data:text/html,hi', 'ftp://x.y']) {
            expect(() => checkLink('link', bad)).toThrow(/https/);
        }
        expect(() => checkLink('url', `https://example.com/${'a'.repeat(500)}`)).toThrow(/too long/);
    });
});

describe('cleanBody', () => {
    it('cleans every string, keeps newlines only in notes, and checks links', () => {
        const body = { name: 'Email\u202E Prof\nLee', notes: 'line 1\nline\u200B 2', priority: 'high', due: null, done: true, n: 3 };
        expect(cleanBody(body)).toEqual({ name: 'Email Prof Lee', notes: 'line 1\nline 2', priority: 'high', due: null, done: true, n: 3 });
        expect(() => cleanBody({ link: 'http://evil.example' })).toThrow(/https/);
        expect(() => cleanBody({ url: 'javascript:alert(1)' })).toThrow(/https/);
    });

    it('cleans nested objects and arrays', () => {
        expect(cleanBody({ list: ['a\u200B', { name: 'b\u202E' }] })).toEqual({ list: ['a', { name: 'b' }] });
    });
});

describe('cleanConnectorWrites', () => {
    it('cleans only connector requests', () => {
        const next = () => {};
        const fromClaude = { client: 'connector', body: { name: 'x\u200B' } };
        cleanConnectorWrites(fromClaude, null, next);
        expect(fromClaude.body.name).toBe('x');
        const fromOwner = { client: 'api', body: { name: 'x\u200B' } };
        cleanConnectorWrites(fromOwner, null, next);
        expect(fromOwner.body.name).toBe('x\u200B');
    });
});
