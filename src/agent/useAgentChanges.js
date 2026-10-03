import { useCallback, useState } from 'react';
import { useResource } from '../hooks/useResource';
import { request } from '../lib/api';

// The scheduled agent's changes since Luke last looked (docs/AGENT.md §3).
// "Last looked" is the agent_seen_at setting, so looking on one screen clears
// the chip on every screen at its next poll. Until the settings load, there's
// nothing to show.
export function useAgentChanges() {
    const settings = useResource('settings');
    const refreshSettings = settings.refresh;
    // set the moment the modal closes, so the chip goes before the server answers
    const [justSeen, setJustSeen] = useState(null);
    const stored = settings.data?.agent_seen_at ?? null;
    const seenAt = [stored, justSeen].filter(Boolean).sort().at(-1) ?? null;
    const changes = useResource('changes', { params: { actor: 'agent', limit: 200, since: seenAt ?? undefined } });

    // since is "at or after" on the server, and a poll for the previous
    // seenAt can still be on screen, so the cut is made here too
    const unseen = settings.data ? (changes.data ?? []).filter(c => !seenAt || c.at > seenAt) : [];

    // at: the newest change Luke saw, by the server's clock, so one that
    // arrived while the modal was open still counts as new
    const markSeen = useCallback(async at => {
        setJustSeen(at);
        try {
            await request('/settings', { method: 'PATCH', body: { agent_seen_at: at } });
        } catch {
            // not saved: the chip comes back, and closing again retries
            setJustSeen(null);
        }
        refreshSettings();
    }, [refreshSettings]);

    return { unseen, markSeen, refresh: changes.refresh };
}
