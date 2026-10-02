// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHiddenCount } from './useHiddenCount';

// jsdom has no layout: each item is 10 px tall, and the list is `room` tall
let room;
let observers;
beforeEach(() => {
    room = 40;
    observers = [];
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function () {
        return this.querySelectorAll('li').length * 10;
    });
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function () {
        return this.tagName === 'UL' ? room : 0;
    });
    vi.stubGlobal('ResizeObserver', class {
        constructor(callback) {
            this.callback = callback;
            observers.push(this);
        }
        observe() {
            this.report();
        }
        report() {
            this.callback([{ contentRect: { width: 100, height: room } }]);
        }
        disconnect() {
            observers = observers.filter(o => o !== this);
        }
    });
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete document.fonts;
});

function List({ items }) {
    const ref = useRef(null);
    const hidden = useHiddenCount(ref, items.join(','), items.length);
    return (
        <ul ref={ref}>
            {items.slice(0, items.length - hidden).map(i => <li key={i}>{i}</li>)}
            {hidden > 0 && <li>+{hidden}</li>}
        </ul>
    );
}

const shown = () => [...document.querySelectorAll('li')].map(li => li.textContent);

describe('useHiddenCount', () => {
    it('hides the last items, with room for the "+N", until the rest fit', () => {
        render(<List items={['a', 'b', 'c', 'd', 'e', 'f']} />);
        expect(shown()).toEqual(['a', 'b', 'c', '+3']);
    });

    it('starts over when the list changes size', () => {
        render(<List items={['a', 'b', 'c', 'd', 'e', 'f']} />);
        room = 50;
        act(() => observers.forEach(o => o.report()));
        expect(shown()).toEqual(['a', 'b', 'c', 'd', '+2']);
    });

    it("doesn't start over for a report of the same size", () => {
        render(<List items={['a', 'b', 'c', 'd', 'e', 'f']} />);
        act(() => observers.forEach(o => o.report()));
        expect(shown()).toEqual(['a', 'b', 'c', '+3']);
    });

    it('starts over once the web fonts have loaded, which can change what fits', async () => {
        let loaded;
        const fonts = new EventTarget();
        Object.assign(fonts, { status: 'loading', ready: new Promise(resolve => { loaded = resolve; }) });
        document.fonts = fonts;
        room = 50;
        render(<List items={['a', 'b', 'c', 'd', 'e', 'f']} />);
        expect(shown()).toEqual(['a', 'b', 'c', 'd', '+2']);
        // in the real font, the same box fits less
        room = 40;
        await act(async () => loaded());
        expect(shown()).toEqual(['a', 'b', 'c', '+3']);
        room = 50;
        act(() => fonts.dispatchEvent(new Event('loadingdone')));
        expect(shown()).toEqual(['a', 'b', 'c', 'd', '+2']);
    });
});
