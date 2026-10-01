import { useState } from 'react';

// A form for one item, built from a list of fields. Checks the values with
// the same zod schema the server uses before sending them, and for an edit,
// sends only the fields that changed.
//
// fields: [{ key, label, type: 'text' | 'textarea' | 'date' | 'time' | 'number' | 'select' | 'checkbox', options, placeholder, optional, omitEmpty }]
// optional: empty means null (cleared); omitEmpty: empty means left out, for the server to fill in
// onSubmit(values) resolves to something truthy when saved, or null when it failed.
export default function EditorForm({ fields, schema, initial = {}, onlyChanges = false, submitLabel, onSubmit, onCancel }) {
    const [values, setValues] = useState(() => Object.fromEntries(fields.map(f => [f.key, toInput(f, initial[f.key])])));
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    async function submit(event) {
        event.preventDefault();
        let payload = Object.fromEntries(fields.map(f => [f.key, fromInput(f, values[f.key])]).filter(([, v]) => v !== undefined));
        if (onlyChanges) {
            payload = Object.fromEntries(Object.entries(payload).filter(([key, value]) => !same(value, initial[key])));
            if (Object.keys(payload).length === 0) return onCancel?.();
        }
        const checked = schema.safeParse(payload);
        if (!checked.success) {
            setErrors(Object.fromEntries(checked.error.issues.map(issue => [issue.path[0] ?? '', readable(issue.message)])));
            return;
        }
        setErrors({});
        setSaving(true);
        const saved = await onSubmit(checked.data);
        setSaving(false);
        if (saved && !onlyChanges) setValues(Object.fromEntries(fields.map(f => [f.key, toInput(f, initial[f.key])])));
    }

    return (
        <form className="editor-form" onSubmit={submit} noValidate>
            {fields.map(f => (
                <label key={f.key} className={`editor-field ${f.type ?? 'text'}`}>
                    <span className="editor-label">{f.label}{f.optional && <span className="editor-optional"> (optional)</span>}</span>
                    <Input field={f} value={values[f.key]} onChange={value => setValues(prev => ({ ...prev, [f.key]: value }))} />
                    {errors[f.key] && <span className="editor-error">{errors[f.key]}</span>}
                </label>
            ))}
            {errors[''] && <p className="editor-error">{errors['']}</p>}
            <div className="editor-buttons">
                <button type="submit" className="editor-primary" disabled={saving}>{saving ? 'Saving…' : submitLabel}</button>
                {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
            </div>
        </form>
    );
}

function Input({ field, value, onChange }) {
    const common = { value, onChange: event => onChange(event.target.value), placeholder: field.placeholder };
    switch (field.type) {
        case 'textarea':
            return <textarea rows={3} {...common} />;
        case 'select':
            return <select {...common}>{field.options.map(o => <option key={o} value={o}>{o}</option>)}</select>;
        case 'checkbox':
            return <input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} />;
        case 'number':
            return <input type="text" inputMode="decimal" enterKeyHint="next" autoComplete="off" {...common} />;
        case 'date':
        case 'time':
            return <input type={field.type} {...common} />;
        default:
            return <input type="text" enterKeyHint="next" autoComplete="off" maxLength={field.max} {...common} />;
    }
}

// what an input shows for a stored value
function toInput(field, value) {
    if (field.type === 'checkbox') return Boolean(value);
    if (value === null || value === undefined) return field.default ?? '';
    return String(value);
}

// what gets sent for an input's value; undefined leaves the field out
function fromInput(field, value) {
    if (field.type === 'checkbox') return value;
    if (field.type === 'number') return value.trim() === '' ? undefined : Number(value);
    // an empty required field is sent as '', so the schema names the problem
    if (value.trim() === '') return field.omitEmpty ? undefined : field.optional ? null : '';
    return value;
}

// zod's message for a missing value isn't written for people
function readable(message) {
    return /received undefined/.test(message) ? 'Required' : message;
}

function same(a, b) {
    return (a ?? null) === (b ?? null) || (a === '' && b === null);
}
