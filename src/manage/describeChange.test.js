import { describe, expect, it } from 'vitest';
import { describeChange, whoMade } from './describeChange';

const task = fields => ({ id: 1, name: 'Pset 4', done_at: null, priority: 'soon', due: null, repeat: null, last_done_at: null, updated_at: 'a', ...fields });
const change = (resource, action, before, after, item_id = '1') => ({ resource, action, before, after, item_id });

describe('describeChange', () => {
    it('reads adds, deletes and plain edits', () => {
        expect(describeChange(change('tasks', 'create', null, task()))).toBe('Added task "Pset 4"');
        expect(describeChange(change('tasks', 'delete', task(), null))).toBe('Deleted task "Pset 4"');
        expect(describeChange(change('tasks', 'update', task(), task({ priority: 'now', due: '2026-10-01', updated_at: 'b' }))))
            .toBe('Changed task "Pset 4": priority soon → now, due nothing → 2026-10-01');
    });

    it('reads a recurring task rolled forward, and its rule in words (docs/BLOCKS.md §3)', () => {
        const laundry = fields => task({ name: 'Laundry', due: '2026-09-27', repeat: '{"every":1,"unit":"week"}', ...fields });
        expect(describeChange(change('tasks', 'update', laundry(), laundry({ due: '2026-10-04', last_done_at: 'x' })))).toBe('Completed task "Laundry", next Sun, Oct 4');
        expect(describeChange(change('tasks', 'update', laundry({ repeat: null }), laundry())))
            .toBe('Changed task "Laundry": repeat nothing → every week');
        expect(describeChange(change('areas', 'create', null, { id: 8, name: 'Music' }))).toBe('Added area "Music"');
    });

    it('names the common actions in plain words', () => {
        expect(describeChange(change('tasks', 'update', task(), task({ done_at: 'x' })))).toBe('Completed task "Pset 4"');
        expect(describeChange(change('tasks', 'update', task({ done_at: 'x' }), task()))).toBe('Restored task "Pset 4"');
        expect(describeChange(change('goals', 'update', { name: 'Books', current: 7 }, { name: 'Books', current: 8 }))).toBe('goal "Books": 7 → 8');
        expect(describeChange(change('habits', 'update', { name: 'Read', archived_at: null }, { name: 'Read', archived_at: 'x' }))).toBe('Archived habit "Read"');
        expect(describeChange(change('applications', 'update', { company: 'Stripe', role: 'Intern', status: 'applied' }, { company: 'Stripe', role: 'Intern', status: 'interview' })))
            .toBe('Moved application "Stripe · Intern" to interview');
        expect(describeChange(change('countdowns', 'update', { label: 'Finals', pinned: 0 }, { label: 'Finals', pinned: 1 }))).toBe('Pinned countdown "Finals"');
    });

    it('reads habit days and settings', () => {
        expect(describeChange(change('habit_checks', 'create', null, { habit_id: 1, date: '2026-09-30', name: 'Read' }))).toBe('Checked "Read" for Sep 30');
        expect(describeChange(change('habit_checks', 'delete', { habit_id: 1, date: '2026-09-30' }, null))).toBe('Unchecked a habit for Sep 30');
        expect(describeChange(change('settings', 'update', { value: '22:00' }, { value: '23:00' }, 'night_start'))).toBe('Set night start to 23:00');
        expect(describeChange(change('settings', 'create', null, { value: 'x' }, 'night_early_until'))).toBe('Started night mode early');
        expect(describeChange(change('settings', 'delete', { value: 'x' }, null, 'night_early_until'))).toBe('Cancelled early night mode');
        expect(describeChange(change('settings', 'delete', { value: '23:00' }, null, 'night_start'))).toBe('Reset night start');
        expect(describeChange(change('settings', 'create', null, { value: 4 }, 'assignments_area'))).toBe('Changed the Assignments area');
    });
    it('reads the connector switches', () => {
        expect(describeChange(change('settings', 'create', null, { value: false }, 'connector_chat_enabled'))).toBe('Switched the claude.ai connector off');
        expect(describeChange(change('settings', 'update', { value: false }, { value: true }, 'connector_agent_enabled'))).toBe("Switched the agent's connector on");
    });
});

describe('whoMade', () => {
    it("says where Claude's changes came from", () => {
        expect(whoMade({ actor: 'claude', via: 'claude.ai' })).toBe('Claude (claude.ai)');
        expect(whoMade({ actor: 'claude', via: 'claude-code' })).toBe('Claude Code');
        expect(whoMade({ actor: 'agent', via: null })).toBe('Claude (accepted suggestion)');
        expect(whoMade({ actor: 'owner', via: null })).toBe('You');
        expect(whoMade({ actor: 'kiosk' })).toBe('Kiosk');
        expect(whoMade({ actor: 'robot' })).toBe('robot');
    });
});
