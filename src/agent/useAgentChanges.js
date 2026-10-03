import { useCallback, useState } from 'react';
import { useNow } from '../hooks/useNow';
import { useResource } from '../hooks/useResource';
import { request } from '../lib/api';
import { buildTimeline, historyStart } from './timeline';

// The scheduled agent's runs and changes for the dock (docs/AGENT.md §3, §7):
// the last few days, and anything older Luke hasn't seen. "Seen" is the
// agent_seen_at setting, so looking on one screen clears "new" on every
// screen at its next poll. Until the settings load, there's nothing to show.
export function useAgentChanges() {
    const settings = useResource('settings');
    const refreshSettings = settings.refresh;
    // set the moment the popover closes, so "new" goes before the server answers
    const [justSeen, setJustSeen] = useState(null);
    const stored = settings.data?.agent_seen_at ?? null;
    const seenAt = [stored, justSeen].filter(Boolean).sort().at(-1) ?? null;

    // the history starts at a local midnight, so this only moves once a day
    const start = historyStart(useNow(60_000));
    // never looked: everything, as far as the limits go
    const since = seenAt ? [seenAt, start].sort()[0] : undefined;
    const runs = useResource('runs', { params: { since, limit: 50 } });
    // Over 200 changes (a long time away), the oldest runs list fewer of
    // their changes here; Undo this run still undoes all of them.
    const changes = useResource('changes', { params: { actor: 'agent', limit: 200, since } });

    const loaded = settings.data && runs.data && changes.data;
    const timeline = loaded ? buildTimeline(runs.data, changes.data, seenAt, start) : { entries: [], newCount: 0, seenUpTo: null };

    // at: what Luke saw, by the server's clock, so a change that arrived
    // while the popover was open still counts as new
    const markSeen = useCallback(async at => {
        // nothing new was shown: leave agent_seen_at where it is
        if (!at || (seenAt && at <= seenAt)) return;
        setJustSeen(at);
        try {
            await request('/settings', { method: 'PATCH', body: { agent_seen_at: at } });
        } catch {
            // not saved: "new" comes back, and closing again retries
            setJustSeen(null);
        }
        refreshSettings();
    }, [seenAt, refreshSettings]);

    const refreshRuns = runs.refresh;
    const refreshChanges = changes.refresh;
    const refresh = useCallback(() => {
        refreshRuns();
        refreshChanges();
    }, [refreshRuns, refreshChanges]);

    return { ...timeline, seenAt, markSeen, refresh };
}
