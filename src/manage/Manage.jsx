import { ApplicationsEditor, CountdownsEditor, GoalsEditor, HabitsEditor, TasksEditor } from '../editors/editors';
import SettingsEditor from '../editors/SettingsEditor';
import History from './History';
import './Manage.css';

const SECTIONS = [
    ['tasks', 'Tasks and deadlines', TasksEditor],
    ['countdowns', 'Countdowns', CountdownsEditor],
    ['goals', 'Goals', GoalsEditor],
    ['habits', 'Habits', HabitsEditor],
    ['applications', 'Job applications', ApplicationsEditor],
    ['settings', 'Settings', SettingsEditor],
    ['history', 'History', History],
];

// Every editor on one page, in a single column that works on a phone (DESIGN §6.3)
export default function Manage() {
    return (
        <main className="manage">
            <header className="manage-header">
                <h1>Manage</h1>
                <a href="/">Dashboard</a>
            </header>
            <nav className="manage-nav">
                {SECTIONS.map(([id, title]) => <a key={id} href={`#${id}`}>{title}</a>)}
            </nav>
            {SECTIONS.map(([id, title, Editor]) => (
                <section key={id} id={id} className="manage-section">
                    <h2>{title}</h2>
                    <Editor />
                </section>
            ))}
        </main>
    );
}
