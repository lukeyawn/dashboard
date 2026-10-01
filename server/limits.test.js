import { describe, expect, it } from 'vitest';
import { LOGIN_LIMIT, createLockout, createLoginLimiter, createRateLimiter, visitorOf } from './limits.js';

describe('login limiter', () => {
    it(`locks after ${LOGIN_LIMIT.failures} failures within the window, then unlocks`, () => {
        let time = 0;
        const limiter = createLoginLimiter({ now: () => time });
        for (let i = 0; i < LOGIN_LIMIT.failures - 1; i++) limiter.recordFailure();
        expect(limiter.isLocked()).toBe(false);
        limiter.recordFailure();
        expect(limiter.isLocked()).toBe(true);
        time += LOGIN_LIMIT.windowMs - 1;
        expect(limiter.isLocked()).toBe(true);
        time += 1;
        expect(limiter.isLocked()).toBe(false);
    });

    it('forgets failures older than the window', () => {
        let time = 0;
        const limiter = createLoginLimiter({ now: () => time });
        for (let i = 0; i < LOGIN_LIMIT.failures - 1; i++) limiter.recordFailure();
        time += LOGIN_LIMIT.windowMs;
        limiter.recordFailure();
        expect(limiter.isLocked()).toBe(false);
    });
});

describe('rate limiter', () => {
    it('allows up to the limit per key in a window, then refuses', () => {
        let time = 0;
        const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => time });
        expect([1, 2, 3, 4].map(() => limiter.allow('a'))).toEqual([true, true, true, false]);
        expect(limiter.allow('b')).toBe(true);
        time += 999;
        expect(limiter.allow('a')).toBe(false);
        time += 1;
        expect(limiter.allow('a')).toBe(true);
    });

    it("doesn't count refused requests, so a key comes back after one window", () => {
        let time = 0;
        const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time });
        limiter.allow();
        for (let i = 0; i < 10; i++) {
            time += 50;
            expect(limiter.allow()).toBe(false);
        }
        time = 1000;
        expect(limiter.allow()).toBe(true);
    });

    it('forgets keys whose window has passed', () => {
        let time = 0;
        const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time });
        for (let i = 0; i < 100; i++) limiter.allow(`visitor-${i}`);
        time += 2000;
        expect(limiter.allow('new')).toBe(true);
        expect(limiter.allow('visitor-1')).toBe(true);
    });
});

describe('lockout', () => {
    it('locks a key after its failures, for the window, and keeps keys apart', () => {
        let time = 0;
        const lockout = createLockout({ failures: 3, windowMs: 1000, now: () => time });
        lockout.recordFailure('a');
        lockout.recordFailure('a');
        expect(lockout.isLocked('a')).toBe(false);
        lockout.recordFailure('a');
        expect(lockout.isLocked('a')).toBe(true);
        expect(lockout.isLocked('b')).toBe(false);
        time += 1000;
        expect(lockout.isLocked('a')).toBe(false);
    });

    it('forgets old failures', () => {
        let time = 0;
        const lockout = createLockout({ failures: 2, windowMs: 1000, now: () => time });
        lockout.recordFailure();
        time += 1000;
        lockout.recordFailure();
        expect(lockout.isLocked()).toBe(false);
    });
});

describe('visitorOf', () => {
    const req = header => ({ get: name => (name === 'x-forwarded-for' ? header : undefined) });

    it('takes the last X-Forwarded-For entry, the one the proxy added', () => {
        expect(visitorOf(req('203.0.113.9'))).toBe('203.0.113.9');
        expect(visitorOf(req('1.1.1.1, 2.2.2.2,  203.0.113.9 '))).toBe('203.0.113.9');
    });

    it('falls back to one shared bucket without the header', () => {
        expect(visitorOf(req(undefined))).toBe('unknown');
        expect(visitorOf(req(''))).toBe('unknown');
    });
});
