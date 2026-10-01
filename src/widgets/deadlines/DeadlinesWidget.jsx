import './DeadlinesWidget.css';

const DAY_MS = 24 * 60 * 60 * 1000;

// parse as local time; new Date("YYYY-MM-DD") would parse as UTC and can land on the wrong day
function parseDate(due) {
    const [y, m, d] = due.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function daysUntil(due) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((parseDate(due) - today) / DAY_MS);
}

function daysLabel(days) {
    if (days < 0) return 'overdue';
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    return `${days} days`;
}

// deadlines: {id: number, name: string, due: string ("YYYY-MM-DD")}[]
export default function DeadlinesWidget({deadlines = []}) {
    const sorted = [...deadlines].sort((a, b) => parseDate(a.due) - parseDate(b.due));

    return (
        <div className="widget deadlines-widget">
            <p className="widget-title">Deadlines</p>
            <ul className="deadlines-list">
                {sorted.map(d => {
                    const days = daysUntil(d.due);
                    return (
                        <li key={d.id} className={days <= 2 ? 'deadline urgent' : 'deadline'}>
                            <div className="deadline-info">
                                <span className="deadline-name">{d.name}</span>
                                <span className="deadline-date">
                                    {parseDate(d.due).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})}
                                </span>
                            </div>
                            <span className="deadline-days">{daysLabel(days)}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
