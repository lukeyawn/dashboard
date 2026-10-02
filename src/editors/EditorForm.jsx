import { useState } from 'react';

// A form for one item, built from a list of fields. Checks the values with
// the same zod schema the server uses before sending them, and for an edit,
// sends only the fields that changed.
//
// fields: [{ key, label, type: 'text' | 'textarea' | 'date' | 'time' | 'number' | 'select' | 'choice' | 'checkbox', options, placeholder, optional, omitEmpty }]
// a select whose options are numbers sends a number; labels: { option: 'shown as' }
// choice: the options as a row of buttons, one pressed, for a few short options
// check(values, before): problems the schema can't see, such as a date that has
// passed, as { field: message } or null; before is the item being edited, or null
// optional: empty means null (cleared); omitEmpty: empty means left out, for the server to fill in
// onSubmit(values) resolves to something truthy when saved, or null when it failed.
export default function EditorForm({ fields, schema, initial = {}, onlyChanges = false, submitLabel, onSubmit, onCancel, check }) {
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
        const problems = check?.(checked.data, onlyChanges ? initial : null);
        if (problems) {
            setErrors(problems);
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
            {fields.map(f => {
                // a row of buttons isn't one control, so it can't sit in a label
                const Field = f.type === 'choice' ? 'div' : 'label';
                return (
                    <Field key={f.key} className={`editor-field ${f.type ?? 'text'}`} role={f.type === 'choice' ? 'group' : undefined} aria-label={f.type === 'choice' ? f.label : undefined}>
                        <span className="editor-label">{f.label}{f.optional && <span className="editor-optional"> (optional)</span>}</span>
                        <Input field={f} value={values[f.key]} onChange={value => setValues(prev => ({ ...prev, [f.key]: value }))} />
                        {errors[f.key] && <span className="editor-error">{errors[f.key]}</span>}
                    </Field>
                );
            })}
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
            // an empty option reads as "not set"
            return <select {...common}>{field.options.map(o => <option key={o} value={o}>{field.labels?.[o] ?? (o || '—')}</option>)}</select>;
        case 'checkbox':
            return <input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} />;
        case 'choice':
            return <Choice options={field.options} labels={field.labels} value={value} onChange={onChange} />;
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
    if (field.type === 'select' && typeof field.options[0] === 'number') return Number(value);
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

// A few short options as a row of buttons, the chosen one pressed
export function Choice({ options, labels = {}, value, onChange }) {
    return (
        <div className="editor-choice">
            {options.map(o => (
                <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>{labels[o] ?? o}</button>
            ))}
        </div>
    );
}
