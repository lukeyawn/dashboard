import { describe, expect, it } from 'vitest';
import { jobSections } from './applications.js';

const TODAY = '2026-09-30';
const app = (id, status, extra = {}) => ({ id, company: `C${id}`, status, applied_on: '2026-09-01', next_on: null, next_time: null, ...extra });
const ids = list => list.map(a => a.id);

describe('jobSections', () => {
    it('puts OAs, offers and upcoming steps under Needs action, by the next step', () => {
        const { needsAction } = jobSections([
            app(1, 'applied', { applied_on: '2026-09-20' }),
            app(2, 'interview', { next_on: '2026-10-06', next_time: '14:00' }),
            app(3, 'offer', { next_on: '2026-10-20' }),
            app(4, 'oa', { next_on: '2026-10-06', next_time: '09:00' }),
            app(5, 'oa'),
            app(6, 'interview', { next_on: TODAY }),
            // an OA past its due date still needs doing
            app(7, 'oa', { next_on: '2026-09-28' }),
        ], TODAY);
        expect(ids(needsAction)).toEqual([7, 6, 4, 2, 3, 5]);
    });

    it('waits on applied ones and interviews with nothing ahead, interviews first, then the most recent', () => {
        const { needsAction, waitingOn } = jobSections([
            app(1, 'applied', { applied_on: '2026-09-20' }),
            app(2, 'interview', { next_on: '2026-09-29' }),
            app(3, 'interview', { applied_on: '2026-09-10' }),
            app(4, 'applied', { applied_on: '2026-09-28' }),
            app(5, 'applied', { applied_on: '2026-09-28' }),
        ], TODAY);
        expect(needsAction).toEqual([]);
        expect(ids(waitingOn)).toEqual([2, 3, 5, 4, 1]);
    });

    it('keeps To apply on its own, by the day to apply by, then the newest', () => {
        const { needsAction, toApply, waitingOn } = jobSections([
            app(1, 'to_apply', { applied_on: null }),
            app(2, 'to_apply', { applied_on: null, next_on: '2026-10-15' }),
            app(3, 'to_apply', { applied_on: null }),
            app(4, 'to_apply', { applied_on: null, next_on: '2026-10-01' }),
        ], TODAY);
        expect(ids(toApply)).toEqual([4, 2, 3, 1]);
        expect([...needsAction, ...waitingOn]).toEqual([]);
    });

    it('leaves out rejected and withdrawn', () => {
        const { needsAction, waitingOn } = jobSections([app(1, 'rejected'), app(2, 'withdrawn', { next_on: '2026-10-06' }), app(3, 'applied')], TODAY);
        expect([...ids(needsAction), ...ids(waitingOn)]).toEqual([3]);
    });
});
