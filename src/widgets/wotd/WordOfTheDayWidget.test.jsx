// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import words from '../../data/words.json';
import WordOfTheDayWidget from './WordOfTheDayWidget';

afterEach(() => vi.useRealTimers());

function wordOn(date) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(date);
    const { container, unmount } = render(<WordOfTheDayWidget />);
    const hanzi = container.querySelector('.wotd-hanzi').textContent;
    unmount();
    return hanzi;
}

describe('WordOfTheDayWidget', () => {
    it('keeps one word all day and moves on at midnight', () => {
        expect(wordOn(new Date(2026, 8, 30, 0, 1))).toBe(wordOn(new Date(2026, 8, 30, 23, 59)));
        expect(wordOn(new Date(2026, 8, 30, 12))).not.toBe(wordOn(new Date(2026, 9, 1, 12)));
    });

    it('marks the hanzi as Chinese and sizes it by its length', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 8, 30, 12));
        const { container } = render(<WordOfTheDayWidget />);
        const hanzi = container.querySelector('.wotd-hanzi');
        expect(hanzi.getAttribute('lang')).toBe('zh-Hans');
        expect(hanzi.style.getPropertyValue('--chars')).toBe(String([...hanzi.textContent].length));
    });
});

describe('the word list', () => {
    it('has a hanzi, pinyin and definition for every word, and no surname readings', () => {
        expect(words.length).toBeGreaterThan(500);
        for (const w of words) {
            expect(w.hanzi && w.pinyin && w.definition).toBeTruthy();
            expect(w.definition).not.toMatch(/^surname|variant of/i);
        }
    });
});
