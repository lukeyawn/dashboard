// The task editor's two richer inputs (docs/BLOCKS.md §3): the area, chosen
// from the list or added to it, and the repeat rule.
import { useState } from 'react';
import { describeRepeat, UNITS } from '../../shared/repeat';
import { useResource } from '../hooks/useResource';
import { request } from '../lib/api';

const NEW = 'new';

// A dropdown of the areas, plus "New area…", which shows a text box. A name
// that matches an area, ignoring case, picks that area instead of adding one.
export function AreaInput({ value, onChange }) {
    const areas = useResource('areas');
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [error, setError] = useState(null);

    async function add() {
        if (!name.trim()) return;
        try {
            const area = await request('/areas', { method: 'POST', body: { name: name.trim() } });
            await areas.refresh();
            onChange(area.id);
            setAdding(false);
            setName('');
            setError(null);
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <>
            <select
                aria-label="Area"
                value={adding ? NEW : (value ?? '')}
                onChange={event => {
                    const chosen = event.target.value;
                    setAdding(chosen === NEW);
                    if (chosen !== NEW) onChange(chosen === '' ? null : Number(chosen));
                }}
            >
                <option value="">—</option>
                {(areas.data ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                <option value={NEW}>New area…</option>
            </select>
            {adding && (
                <span className="editor-inline">
                    <input type="text" aria-label="New area" autoComplete="off" maxLength={40} value={name} onChange={event => setName(event.target.value)} />
                    <button type="button" onClick={add}>Add area</button>
                </span>
            )}
            {error && <span className="editor-error">{error}</span>}
        </>
    );
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The repeat rule: never, or every N days, weeks, months or years, with
// optional weekdays for weeks and a day of the month for months. Without
// them, the due date's own weekday or day is used.
export function RepeatInput({ value, onChange }) {
    const rule = value;
    const set = changes => {
        const next = { ...rule, ...changes };
        if (next.unit !== 'week') delete next.weekdays;
        if (next.unit !== 'month') delete next.day_of_month;
        onChange(next);
    };
    const toggleDay = day => {
        const days = new Set(rule.weekdays ?? []);
        days.has(day) ? days.delete(day) : days.add(day);
        const weekdays = [...days].sort();
        set({ weekdays: weekdays.length ? weekdays : undefined });
    };

    return (
        <>
            <span className="editor-inline">
                <select
                    aria-label="Repeats"
                    value={rule ? rule.unit : ''}
                    onChange={event => (event.target.value ? set({ every: rule?.every ?? 1, unit: event.target.value }) : onChange(null))}
                >
                    <option value="">Doesn't repeat</option>
                    {UNITS.map(unit => <option key={unit} value={unit}>Every {unit}</option>)}
                </select>
                {rule && (
                    <label className="editor-inline">
                        <span className="editor-label">every</span>
                        <input
                            type="text"
                            inputMode="numeric"
                            aria-label="Every how many"
                            className="editor-short"
                            value={rule.every}
                            onChange={event => set({ every: Number(event.target.value) || event.target.value })}
                        />
                        <span className="editor-label">{rule.every === 1 ? rule.unit : `${rule.unit}s`}</span>
                    </label>
                )}
            </span>
            {rule?.unit === 'week' && (
                <span className="editor-choice" role="group" aria-label="On these days">
                    {WEEKDAY_LETTERS.map((letter, day) => (
                        <button key={day} type="button" aria-label={WEEKDAY_NAMES[day]} aria-pressed={Boolean(rule.weekdays?.includes(day))} onClick={() => toggleDay(day)}>{letter}</button>
                    ))}
                </span>
            )}
            {rule?.unit === 'month' && (
                <label className="editor-inline">
                    <span className="editor-label">on day</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        aria-label="Day of the month"
                        className="editor-short"
                        placeholder="due's"
                        value={rule.day_of_month ?? ''}
                        onChange={event => set({ day_of_month: event.target.value === '' ? undefined : Number(event.target.value) || event.target.value })}
                    />
                </label>
            )}
            {rule && typeof rule.every === 'number' && <span className="editor-detail">{describeRepeat(rule)}, from the due date</span>}
        </>
    );
}
