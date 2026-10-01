import './TasksWidget.css';

// tasks: {id: number, name: string}[]
export default function TasksWidget({tasks = []}) {
    return (
        <div className="widget tasks-widget">
            <p className="widget-title">Tasks</p>
            {tasks.length === 0 ? (
                <p className="tasks-empty">No tasks! Time to relax!</p>
            ) : (
                <ul className="tasks-list">
                    {tasks.map(t => (
                        <li key={t.id}>
                            {t.name}
                            <input type="checkbox" id={`task-${t.id}`} checked={false} readOnly />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
