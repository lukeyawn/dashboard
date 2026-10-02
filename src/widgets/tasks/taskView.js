import { useEffect, useState } from 'react';
import { compareTasks } from '../../../shared/tasks';
import { IDLE_MS } from '../../config';
import { useIdle } from '../../hooks/useIdle';

// How the Tasks tile sorts and filters (docs/BLOCKS.md §3). area is an area
// id, or null for every area; quick keeps tasks of 15 minutes or less.
export const DEFAULT_VIEW = { sort: 'priority', area: null, quick: false };

export const SORTS = {
    priority: 'Priority',
    due: 'Due date',
    shortest: 'Shortest first',
    newest: 'Newest',
};

export const QUICK_MINUTES = 15;

// each sort falls back to the default order, so ties stay put
const COMPARE = {
    priority: compareTasks,
    due: (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || compareTasks(a, b),
    shortest: (a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity) || compareTasks(a, b),
    newest: (a, b) => b.id - a.id,
};

export function viewTasks(tasks, { sort, area, quick }) {
    return tasks
        .filter(t => area === null || t.area_id === area)
        .filter(t => !quick || (Boolean(t.minutes) && t.minutes <= QUICK_MINUTES))
        .sort(COMPARE[sort] ?? compareTasks);
}

// what the header adds to "Tasks", so a filtered list is never mistaken for
// the whole one: "School", "≤ 15 min", or both
export function filterLabel({ area, quick }, areas) {
    const parts = [areas.find(a => a.id === area)?.name, quick && `≤ ${QUICK_MINUTES} min`].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
}

const STORAGE_KEY = 'tasks-view';

function load() {
    try {
        return { ...DEFAULT_VIEW, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
    } catch {
        return DEFAULT_VIEW;
    }
}

// The tile's sort and filter. The choice stays until changed, in this
// browser; on the kiosk it goes back to the default after 5 minutes without
// a touch, so the wall can't stay filtered for days unnoticed.
export function useTaskView(isKiosk) {
    const [view, setView] = useState(load);
    const { idle } = useIdle(IDLE_MS);
    // set while rendering, when idle starts, rather than in an effect
    const [wasIdle, setWasIdle] = useState(idle);
    if (idle !== wasIdle) {
        setWasIdle(idle);
        if (idle && isKiosk) setView(DEFAULT_VIEW);
    }

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
        } catch {
            // private mode or full: the choice just won't outlive the page
        }
    }, [view]);

    return [view, changes => setView(v => ({ ...v, ...changes }))];
}
