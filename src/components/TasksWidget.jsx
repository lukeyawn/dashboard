// tasks: {id: number, name: string, done: boolean}[]
export default function TasksWidget({tasks = []}) {
    if (tasks.length === 0) return <div className="tasks-widget">No tasks! Time to relax!</div>;
    return (
        <ul className="tasks-widget">
            {tasks.map(t => (
                <li key={t.id}>{t.name}
                    <input
                        type="checkbox" 
                        id={`task-${t.id}`}
                        checked={t.done}
                        onChange={() => toggleTask(t.id)}
                    />
                </li>))}
        </ul>
    );
}