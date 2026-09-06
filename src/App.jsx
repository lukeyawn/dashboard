import './styles.css';
import CountdownWidget from "./components/CountdownWidget";
import TasksWidget from "./components/TasksWidget"
import WidgetShell from './components/WidgetShell';

// scratch
import Counter from './scratch/Counter';
import './scratch/scratch.css';
export default function App() {
    return (
        <div className="dashboard">
            <WidgetShell>
                <CountdownWidget time={42} unit="weeks" event="Thanksgiving Break"/>
            </WidgetShell>
            <Counter></Counter>
            <WidgetShell>
                <TasksWidget tasks={[{id: 1, name: "do laundry"}, {id: 2, name: "Finish OS Shell project"}]}/>
            </WidgetShell>
            
        </div>
    );
}