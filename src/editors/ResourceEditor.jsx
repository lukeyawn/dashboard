import { useEffect, useState } from 'react';
import { useResource } from '../hooks/useResource';
import EditorForm from './EditorForm';
import './editors.css';

// One resource's editor: an add form, then the items, each with Edit, Delete
// and its own actions (DESIGN §6.3). Rendered both in the dashboard's ✎ modal
// and on /manage. The per-resource editors in this folder configure it.
//
// sections(rows): [{ title, rows }] how to group the items
// describe(row): { title, detail } how an item reads in the list
// actions(row): [{ label, changes }] extra one-tap buttons, such as Archive
// filters: [{ key, label, options }] narrow the list; options may be a function of the rows
// sorts:   [{ label, compare }] orders the list; the first is the default
export default function ResourceEditor({ resource, noun, params, fields, createSchema, updateSchema, sections, describe, actions = () => [], createFields = fields, filters = [], sorts = [] }) {
    const items = useResource(resource, { params });
    const [editing, setEditing] = useState(null);
    const [chosen, setChosen] = useState({});
    const [sortIndex, setSortIndex] = useState(0);

    // the rows the sections see: filtered, then sorted
    const shown = rows => {
        const filtered = rows.filter(row => filters.every(f => !chosen[f.key] || String(row[f.key] ?? '') === chosen[f.key]));
        return sorts[sortIndex] ? [...filtered].sort(sorts[sortIndex].compare) : filtered;
    };

    let list;
    if (items.loading) list = <p className="editor-message">Loading…</p>;
    else if (!items.data) list = <p className="editor-message">Couldn't load. {items.error?.message}</p>;
    else {
        list = sections(shown(items.data)).filter(s => s.rows.length > 0 || !s.title).map(section => (
            <section key={section.title ?? 'main'} className="editor-section">
                {section.title && <h3>{section.title}</h3>}
                {section.rows.length === 0 && <p className="editor-message">Nothing here yet.</p>}
                <ul className="editor-list">
                    {section.rows.map(row => (
                        <li key={row.id} className="editor-item">
                            {editing === row.id ? (
                                <EditorForm
                                    fields={fields}
                                    schema={updateSchema}
                                    initial={row}
                                    onlyChanges
                                    submitLabel="Save"
                                    onSubmit={async changes => {
                                        const saved = await items.update(row.id, changes);
                                        if (saved) setEditing(null);
                                        return saved;
                                    }}
                                    onCancel={() => setEditing(null)}
                                />
                            ) : (
                                <ItemRow
                                    {...describe(row)}
                                    actions={actions(row)}
                                    onAction={changes => items.update(row.id, changes)}
                                    onEdit={() => setEditing(row.id)}
                                    onDelete={() => items.remove(row.id)}
                                />
                            )}
                        </li>
                    ))}
                </ul>
            </section>
        ));
    }

    return (
        <div className="editor">
            <details className="editor-add">
                <summary>Add {/^[aeiou]/.test(noun) ? 'an' : 'a'} {noun}</summary>
                <EditorForm fields={createFields} schema={createSchema} submitLabel={`Add ${noun}`} onSubmit={values => items.create(values)} />
            </details>
            {items.saveError && <p className="editor-error" role="status">Couldn't save. {items.saveError.message}</p>}
            {(filters.length > 0 || sorts.length > 1) && items.data && (
                <div className="editor-toolbar">
                    {filters.map(f => {
                        const options = typeof f.options === 'function' ? f.options(items.data) : f.options;
                        return (
                            <label key={f.key}>
                                <span className="editor-label">{f.label}</span>
                                <select value={chosen[f.key] ?? ''} onChange={event => setChosen(prev => ({ ...prev, [f.key]: event.target.value }))}>
                                    <option value="">All</option>
                                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </label>
                        );
                    })}
                    {sorts.length > 1 && (
                        <label>
                            <span className="editor-label">Sort</span>
                            <select value={sortIndex} onChange={event => setSortIndex(Number(event.target.value))}>
                                {sorts.map((o, i) => <option key={o.label} value={i}>{o.label}</option>)}
                            </select>
                        </label>
                    )}
                </div>
            )}
            {list}
        </div>
    );
}

function ItemRow({ title, detail, actions, onAction, onEdit, onDelete }) {
    return (
        <div className="editor-row">
            <div className="editor-text">
                <span className="editor-title">{title}</span>
                {detail && <span className="editor-detail">{detail}</span>}
            </div>
            <div className="editor-buttons">
                {actions.map(a => <button key={a.label} type="button" onClick={() => onAction(a.changes)}>{a.label}</button>)}
                <button type="button" onClick={onEdit}>Edit</button>
                <DeleteButton onDelete={onDelete} />
            </div>
        </div>
    );
}

// Deleting is permanent, so it takes two taps; the second must come within 4 seconds
function DeleteButton({ onDelete }) {
    const [armed, setArmed] = useState(false);

    useEffect(() => {
        if (!armed) return;
        const timer = setTimeout(() => setArmed(false), 4000);
        return () => clearTimeout(timer);
    }, [armed]);

    return (
        <button
            type="button"
            className={armed ? 'editor-danger armed' : 'editor-danger'}
            onClick={() => (armed ? onDelete() : setArmed(true))}
        >
            {armed ? 'Tap again to delete' : 'Delete'}
        </button>
    );
}
