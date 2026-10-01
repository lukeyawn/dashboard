import './GoalsWidget.css';

// goals: {id: number, name: string, current: number, target: number, unit?: string}[]
export default function GoalsWidget({goals = []}) {
    return (
        <div className="widget goals-widget">
            <p className="widget-title">Goals</p>
            <ul className="goals-list">
                {goals.map(g => {
                    const percent = Math.min(100, Math.round(g.current / g.target * 100));
                    return (
                        <li key={g.id}>
                            <div className="goal-header">
                                <span className="goal-name">{g.name}</span>
                                <span className="goal-progress">{g.current}/{g.target} {g.unit}</span>
                            </div>
                            <div className="progress-track">
                                <div className="progress-fill" style={{width: `${percent}%`}} />
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
