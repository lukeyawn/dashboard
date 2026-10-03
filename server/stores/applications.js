import { STATUSES } from '../../shared/schemas.js';
import { createStore } from '../crud.js';
import { HttpError } from '../errors.js';

// The job search (docs/BLOCKS.md §6). Each application carries url_by_claude:
// true when Claude wrote its link, so the tile asks before opening it.
export function createApplicationStore(db, { log } = {}) {
    const store = createStore(db, {
        table: 'applications',
        columns: ['company', 'role', 'status', 'applied_on', 'url', 'notes', 'source', 'next_on', 'next_time'],
        // the most recently updated first; the tile orders them its own way (shared/applications.js)
        orderBy: 'updated_at DESC, id DESC',
        filters: {
            status: Object.fromEntries(STATUSES.map(s => [s, `status = '${s}'`])),
        },
        log,
        sourced: true,
    });

    function marked(rows) {
        const claudes = log?.claudeValues('applications', 'url') ?? new Map();
        return rows.map(row => row && { ...row, url_by_claude: Boolean(row.url) && Boolean(claudes.get(`${row.id}|${row.created_at}`)?.has(row.url)) });
    }
    const one = row => marked([row])[0];

    return {
        ...store,
        list: filters => marked(store.list(filters)),
        get: id => one(store.get(id)),
        findBySource: source => one(store.findBySource(source)),
        create: values => one(store.create(values)),

        // a time needs a date, so clearing the date clears the time
        update: db.transaction((id, changes) => {
            const before = store.raw(id);
            if (!before) return null;
            if (changes.next_on === null) return one(store.update(id, { ...changes, next_time: null }));
            if (changes.next_time && !(changes.next_on ?? before.next_on)) throw new HttpError(400, 'A time needs a date.');
            return one(store.update(id, changes));
        }),
    };
}
