export default function TasksWidget({tasks = []}) {
    if (tasks.length === 0) return <div className="tasks-widget">No tasks! Time to relax!</div>;
    return (
        <ul className="tasks-widget">
            {tasks.map(t => <li key={t.key}>{t.name}</li>)}
        </ul>
    );
}