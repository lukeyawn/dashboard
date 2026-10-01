import { Fragment } from 'react';

// counts consecutive done days, walking back from today
function streak(days) {
    let count = 0;
    for (let i = days.length - 1; i >= 0 && days[i]; i--) count++;
    return count;
}

// habits: {id: number, name: string, days: boolean[]}[], where days is the last 7 days, oldest first, ending today
export default function HabitWidget({habits = []}) {
    const today = new Date();
    const dayLabels = Array.from({length: 7}, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - 6 + i);
        return d.toLocaleDateString('en-US', {weekday: 'narrow'});
    });

    return (
        <div className="widget habit-widget">
            <p className="widget-title">Habits</p>
            <div className="habit-grid">
                <div />
                {dayLabels.map((label, i) => (
                    <div key={i} className={i === 6 ? 'habit-day-label today' : 'habit-day-label'}>{label}</div>
                ))}
                <div />
                {habits.map(h => (
                    <Fragment key={h.id}>
                        <div className="habit-name">{h.name}</div>
                        {h.days.map((done, i) => <div key={i} className={done ? 'habit-dot done' : 'habit-dot'} />)}
                        <div className="habit-streak">{streak(h.days)}d</div>
                    </Fragment>
                ))}
            </div>
        </div>
    );
}
