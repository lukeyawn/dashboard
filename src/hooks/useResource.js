import { useCallback, useEffect, useRef, useState } from 'react';
import { POLL_MS } from '../config';
import { query, request } from '../lib/api';

// A widget's data for one resource (DESIGN §6). Loads on mount, refetches every
// pollMs and whenever the window regains focus, and keeps the last good data
// when a refetch fails (stale). Changes are optimistic: the view updates at
// once, and a failed request puts it back and sets saveError.
export function useResource(resource, { params, pollMs = POLL_MS } = {}) {
    const path = `/${resource}${query(params)}`;
    const [state, setState] = useState({ data: null, loading: true, error: null, stale: false, saveError: null });

    // A poll that was sent before the latest local change could carry older
    // data, so its answer is dropped (DESIGN §14, polls versus taps). Only the
    // newest poll's answer counts, which also drops a poll for an old path.
    const changes = useRef(0);
    const latestPoll = useRef(0);

    const refresh = useCallback(async () => {
        const poll = ++latestPoll.current;
        const changesAtStart = changes.current;
        const isCurrent = () => poll === latestPoll.current && changesAtStart === changes.current;
        try {
            const data = await request(path);
            if (isCurrent()) setState({ data, loading: false, error: null, stale: false, saveError: null });
        } catch (error) {
            if (isCurrent()) setState(prev => ({ ...prev, loading: false, error, stale: prev.data !== null }));
        }
    }, [path]);

    useEffect(() => {
        refresh();
        const timer = setInterval(refresh, pollMs);
        const onVisible = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [refresh, pollMs]);

    // Applies a change to the local rows, sends it, and either confirms or undoes it.
    // Resolves to the server's answer, or null if it failed.
    const change = useCallback(async ({ apply, send, confirm, undo }) => {
        changes.current++;
        if (apply) setState(prev => ({ ...prev, data: apply(prev.data ?? []) }));
        try {
            const result = await send();
            changes.current++;
            setState(prev => ({ ...prev, data: confirm(prev.data ?? [], result), saveError: null }));
            return result ?? true;
        } catch (error) {
            changes.current++;
            setState(prev => ({ ...prev, data: undo ? undo(prev.data ?? []) : prev.data, saveError: error }));
            return null;
        }
    }, []);

    const create = useCallback(body => change({
        send: () => request(`/${resource}`, { method: 'POST', body }),
        confirm: (rows, row) => [...rows, row],
    }), [resource, change]);

    const update = useCallback((id, changesToRow) => {
        let original;
        return change({
            apply: rows => rows.map(row => {
                if (row.id !== id) return row;
                original = row;
                return { ...row, ...changesToRow };
            }),
            send: () => request(`/${resource}/${id}`, { method: 'PATCH', body: changesToRow }),
            confirm: (rows, saved) => rows.map(row => (row.id === id ? saved : row)),
            undo: rows => rows.map(row => (row.id === id && original ? original : row)),
        });
    }, [resource, change]);

    const remove = useCallback(id => {
        let original;
        return change({
            apply: rows => {
                original = rows.find(row => row.id === id);
                return rows.filter(row => row.id !== id);
            },
            send: () => request(`/${resource}/${id}`, { method: 'DELETE' }),
            confirm: rows => rows,
            undo: rows => (original ? [...rows, original].sort((a, b) => a.id - b.id) : rows),
        });
    }, [resource, change]);

    // a quick action on one row, such as POST /goals/7/increment, whose answer
    // is the row's new state; optimistic(row) is how it should look meanwhile
    const action = useCallback((id, path, { method = 'POST', body, optimistic } = {}) => {
        let original;
        return change({
            apply: optimistic && (rows => rows.map(row => {
                if (row.id !== id) return row;
                original = row;
                return optimistic(row);
            })),
            send: () => request(`/${resource}/${id}${path}`, { method, body }),
            confirm: (rows, saved) => rows.map(row => (row.id === id ? saved : row)),
            undo: rows => rows.map(row => (row.id === id && original ? original : row)),
        });
    }, [resource, change]);

    return { ...state, refresh, create, update, remove, action };
}
